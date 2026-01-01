#!/bin/bash

set -e

# 定数
readonly WORKFLOW_FILE=".github/workflows/trigger-knowledge-collection.yml"
readonly WORKFLOW_SOURCE=".github/workflows/trigger-knowledge-collection.yml"
readonly DEFAULT_BRANCH_NAME="add-knowledge-trigger"
readonly KNOWLEDGE_REPO="review-dojo-knowledge"

# 変数
DRY_RUN=false
FORCE_DELETE=false
DELAY_SECONDS=2
TARGET_ORG=""
SPECIFIC_REPOS=""
EXCLUDE_REPOS=""
BRANCH_NAME="$DEFAULT_BRANCH_NAME"
SETUP_SECRETS=false
ORG_SECRETS=false
SETUP_PERMISSIONS=false
ORG_PERMISSIONS=false
KNOWLEDGE_REPO_NAME="$KNOWLEDGE_REPO"

# カウンター
SUCCESS_COUNT=0
SKIP_COUNT=0
ERROR_COUNT=0

# 成功したリポジトリのリスト
declare -a SUCCESS_REPOS
declare -a SKIP_REPOS
declare -a ERROR_REPOS

# ヘルプ表示
show_help() {
    cat <<EOF
Usage: $(basename "$0") [options] <org>

GitHub organization配下のリポジトリに trigger-knowledge-collection.yml を配布します。
また、GitHub Secretsを設定することもできます。

Options:
  Workflow Distribution:
    --dry-run           実際には変更せず、対象リポジトリを表示
    --repos <list>      特定のリポジトリのみを対象（カンマ区切り）
    --exclude <list>    追加で除外するリポジトリ（カンマ区切り）
    --branch <name>     作成するブランチ名（デフォルト: $DEFAULT_BRANCH_NAME）
    --force-delete      既存ブランチを確認なしで削除
    --delay <seconds>   各リポジトリ処理後の待機時間（デフォルト: 2秒）
    --no-delay          待機時間なし（高速モード、レート制限注意）

  Secrets Setup:
    --setup-secrets     Secrets設定を実行（設定後ワークフロー配布の確認あり）
    --org-secrets       Organization Secretsとして設定（Org必須）
    --knowledge-repo <repo>  knowledge-repoの名前（デフォルト: $KNOWLEDGE_REPO）

  Permissions Setup:
    --setup-permissions Actions権限設定を実行（設定後ワークフロー配布の確認あり）
    --org-permissions   Organizationレベルで設定（Org必須）

  General:
    -h, --help          このヘルプを表示

Examples:
  # ワークフロー配布のみ
  $(basename "$0") sk8metalme

  # dry-runで確認
  $(basename "$0") --dry-run sk8metalme

  # 特定リポジトリのみ
  $(basename "$0") --repos "repo1,repo2" sk8metalme

  # Organization Secretsを設定してから配布
  $(basename "$0") --setup-secrets --org-secrets sk8metalme

  # Repository Secretsを設定（個人用）
  $(basename "$0") --setup-secrets my-username

  # Actions権限をリポジトリ単位で設定
  $(basename "$0") --setup-permissions sk8metalme

  # Actions権限をOrganizationレベルで設定
  $(basename "$0") --setup-permissions --org-permissions sk8metalme

  # Secretsと権限を一緒に設定
  $(basename "$0") --setup-secrets --setup-permissions --org-secrets --org-permissions sk8metalme

EOF
}

# エラーメッセージ
error() {
    echo "Error: $1" >&2
}

# 情報メッセージ
info() {
    echo "[INFO] $1"
}

# 警告メッセージ
warn() {
    echo "[WARN] $1" >&2
}

# コマンド出力を配列に変換
read_into_array() {
    local var_name="$1"
    shift
    eval "$var_name=()"
    while IFS= read -r line; do
        eval "$var_name+=(\"\$line\")"
    done < <("$@")
}

# アカウントタイプを検出（Organization or User）
detect_account_type() {
    local name="$1"

    # Organization APIを呼び出し
    if gh api "orgs/$name" --silent 2>/dev/null; then
        echo "org"
    else
        # ユーザーとして存在するか確認
        if gh api "users/$name" --silent 2>/dev/null; then
            echo "user"
        else
            echo "unknown"
        fi
    fi
}

# Organization Admin権限をチェック
check_org_admin() {
    local org="$1"
    local role
    role=$(gh api "orgs/$org/memberships/$(gh api user --jq '.login')" \
        --jq '.role' 2>/dev/null)

    if [[ "$role" != "admin" ]]; then
        error "Organization admin権限が必要です（現在: $role）"
        error "Organization SecretsにはAdmin権限が必要です"
        return 1
    fi

    return 0
}

# gh CLI スコープを確認
check_gh_scopes() {
    if [[ "$ORG_SECRETS" == true || "$ORG_PERMISSIONS" == true ]]; then
        local scopes
        # gh api user -i のレスポンスヘッダーから X-OAuth-Scopes を取得
        scopes=$(gh api user -i 2>/dev/null | grep -i '^x-oauth-scopes:' | cut -d: -f2- | tr ',' '\n' | tr -d ' ')

        if ! echo "$scopes" | grep -q "admin:org"; then
            warn "admin:org スコープがありません"
            if [[ "$ORG_SECRETS" == true ]]; then
                warn "Organization Secretsを設定するには以下を実行してください:"
            else
                warn "Organization Permissionsを設定するには以下を実行してください:"
            fi
            warn "  gh auth refresh -s admin:org"
            return 1
        fi
    fi

    return 0
}

# Secret値を対話型で入力
read_secret() {
    local prompt="$1"
    local var_name="$2"
    local value

    echo -n "$prompt: "
    read -s value
    echo  # 改行

    if [[ -z "$value" ]]; then
        error "値が入力されていません"
        return 1
    fi

    eval "$var_name=\"\$value\""
    return 0
}

# 全Secrets値を入力
prompt_secrets() {
    echo ""
    echo "Enter secrets (input will be hidden):"
    echo ""

    read_secret "  ANTHROPIC_API_KEY" ANTHROPIC_API_KEY_VALUE || return 1
    read_secret "  ORG_GITHUB_TOKEN" ORG_GITHUB_TOKEN_VALUE || return 1

    echo ""
    return 0
}

# Organization Secretsを設定
setup_org_secrets() {
    local org="$1"
    local knowledge_repo="$2"
    local failed=0

    info "Setting secrets..."

    # ANTHROPIC_API_KEY - knowledge-repoのみアクセス可能
    echo -n "  ANTHROPIC_API_KEY      → $org (repos: $knowledge_repo) ... "
    if echo "$ANTHROPIC_API_KEY_VALUE" | gh secret set ANTHROPIC_API_KEY --org "$org" --repos "$knowledge_repo" 2>/dev/null; then
        echo "[OK]"
    else
        echo "[FAILED]"
        failed=$((failed + 1))
    fi

    # ORG_GITHUB_TOKEN - 全リポジトリからアクセス可能
    echo -n "  ORG_GITHUB_TOKEN       → $org (visibility: all) ... "
    if echo "$ORG_GITHUB_TOKEN_VALUE" | gh secret set ORG_GITHUB_TOKEN --org "$org" --visibility all 2>/dev/null; then
        echo "[OK]"
    else
        echo "[FAILED]"
        failed=$((failed + 1))
    fi

    echo ""
    return $failed
}

# Repository Secretsを設定
setup_repo_secrets() {
    local owner="$1"
    local knowledge_repo="$2"
    shift 2
    local repos=("$@")
    local failed=0

    info "Setting secrets..."

    # knowledge-repoに全Secret設定
    info "Setting secrets for $owner/$knowledge_repo:"
    echo -n "  ANTHROPIC_API_KEY      → $owner/$knowledge_repo ... "
    if echo "$ANTHROPIC_API_KEY_VALUE" | gh secret set ANTHROPIC_API_KEY -R "$owner/$knowledge_repo" 2>/dev/null; then
        echo "[OK]"
    else
        echo "[FAILED]"
        failed=$((failed + 1))
    fi

    echo -n "  ORG_GITHUB_TOKEN       → $owner/$knowledge_repo ... "
    if echo "$ORG_GITHUB_TOKEN_VALUE" | gh secret set ORG_GITHUB_TOKEN -R "$owner/$knowledge_repo" 2>/dev/null; then
        echo "[OK]"
    else
        echo "[FAILED]"
        failed=$((failed + 1))
    fi

    # 他のリポジトリにはORG_GITHUB_TOKENのみ
    if [[ ${#repos[@]} -gt 0 ]]; then
        echo ""
        info "Setting ORG_GITHUB_TOKEN for other repositories:"
        for repo in "${repos[@]}"; do
            if [[ "$repo" == "$knowledge_repo" ]]; then
                continue
            fi

            echo -n "  ORG_GITHUB_TOKEN       → $owner/$repo ... "
            if echo "$ORG_GITHUB_TOKEN_VALUE" | gh secret set ORG_GITHUB_TOKEN -R "$owner/$repo" 2>/dev/null; then
                echo "[OK]"
            else
                echo "[FAILED]"
                failed=$((failed + 1))
            fi
        done
    fi

    echo ""
    return $failed
}

# Organization Permissionsを設定
setup_org_permissions() {
    local org="$1"

    info "Setting Actions permissions..."

    echo -n "  Workflow permissions       → $org (org-level) ... "
    if gh api --silent "orgs/$org/actions/permissions/workflow" \
        -X PUT \
        -f default_workflow_permissions=write \
        -F can_approve_pull_request_reviews=true 2>/dev/null; then
        echo "[OK]"
        return 0
    else
        echo "[FAILED]"
        return 1
    fi
}

# Repository Permissionsを設定
setup_repo_permissions() {
    local owner="$1"
    shift
    local repos=("$@")
    local failed=0

    info "Setting Actions permissions..."

    for repo in "${repos[@]}"; do
        echo -n "  Workflow permissions       → $owner/$repo ... "
        if gh api --silent "repos/$owner/$repo/actions/permissions/workflow" \
            -X PUT \
            -f default_workflow_permissions=write \
            -F can_approve_pull_request_reviews=true 2>/dev/null; then
            echo "[OK]"
        else
            echo "[FAILED]"
            failed=$((failed + 1))
        fi
    done

    echo ""
    return $failed
}

# 引数パース
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --force-delete)
                FORCE_DELETE=true
                shift
                ;;
            --delay)
                if [[ -z "${2:-}" || "$2" == -* ]]; then
                    error "--delay requires an argument"
                    exit 1
                fi
                DELAY_SECONDS="$2"
                # 数値検証: 整数または小数、非負のみ許可
                if ! [[ "$DELAY_SECONDS" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
                    error "--delay must be a non-negative number (got: '$DELAY_SECONDS')"
                    exit 1
                fi
                shift 2
                ;;
            --no-delay)
                DELAY_SECONDS=0
                shift
                ;;
            --repos)
                if [[ -z "${2:-}" || "$2" == -* ]]; then
                    error "--repos requires an argument"
                    exit 1
                fi
                SPECIFIC_REPOS="$2"
                shift 2
                ;;
            --exclude)
                if [[ -z "${2:-}" || "$2" == -* ]]; then
                    error "--exclude requires an argument"
                    exit 1
                fi
                EXCLUDE_REPOS="$2"
                shift 2
                ;;
            --branch)
                if [[ -z "${2:-}" || "$2" == -* ]]; then
                    error "--branch requires an argument"
                    exit 1
                fi
                BRANCH_NAME="$2"
                shift 2
                ;;
            --setup-secrets)
                SETUP_SECRETS=true
                shift
                ;;
            --org-secrets)
                ORG_SECRETS=true
                shift
                ;;
            --setup-permissions)
                SETUP_PERMISSIONS=true
                shift
                ;;
            --org-permissions)
                ORG_PERMISSIONS=true
                shift
                ;;
            --knowledge-repo)
                if [[ -z "${2:-}" || "$2" == -* ]]; then
                    error "--knowledge-repo requires an argument"
                    exit 1
                fi
                KNOWLEDGE_REPO_NAME="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            -*)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
            *)
                TARGET_ORG="$1"
                shift
                ;;
        esac
    done

    if [[ -z "$TARGET_ORG" ]]; then
        error "Organization name is required"
        show_help
        exit 1
    fi
}

# GitHub CLIが利用可能かチェック
check_gh_cli() {
    if ! command -v gh &> /dev/null; then
        error "GitHub CLI (gh) is not installed"
        exit 1
    fi

    # 認証チェック
    if ! gh auth status &> /dev/null; then
        error "GitHub CLI is not authenticated. Run 'gh auth login' first"
        exit 1
    fi
}

# ワークフローファイルの存在確認
check_workflow_file() {
    if [[ ! -f "$WORKFLOW_SOURCE" ]]; then
        error "Workflow file not found: $WORKFLOW_SOURCE"
        exit 1
    fi
}

# リポジトリ一覧を取得
get_repositories() {
    local org="$1"
    info "Fetching repositories from $org..."

    gh repo list "$org" --json name,isArchived --limit 1000 --jq '.[] | select(.isArchived == false) | .name'
}

# リポジトリをフィルタリング
filter_repositories() {
    local -a repos=("$@")
    local -a filtered=()

    # デフォルト除外リスト
    local -a default_excludes=("$KNOWLEDGE_REPO")

    # 追加除外リストを解析
    if [[ -n "$EXCLUDE_REPOS" ]]; then
        IFS=',' read -ra additional_excludes <<< "$EXCLUDE_REPOS"
        default_excludes+=("${additional_excludes[@]}")
    fi

    for repo in "${repos[@]}"; do
        local should_exclude=false

        # 除外リストをチェック
        for exclude in "${default_excludes[@]}"; do
            if [[ "$repo" == "$exclude" ]]; then
                should_exclude=true
                break
            fi
        done

        if [[ "$should_exclude" == false ]]; then
            filtered+=("$repo")
        fi
    done

    # 特定リポジトリのみ対象の場合
    if [[ -n "$SPECIFIC_REPOS" ]]; then
        IFS=',' read -ra specific_list <<< "$SPECIFIC_REPOS"
        local -a final_list=()

        for repo in "${filtered[@]}"; do
            for specific in "${specific_list[@]}"; do
                if [[ "$repo" == "$specific" ]]; then
                    final_list+=("$repo")
                    break
                fi
            done
        done

        filtered=("${final_list[@]}")
    fi

    printf '%s\n' "${filtered[@]}"
}

# ワークフローが既に存在するかチェック
check_workflow_exists() {
    local org="$1"
    local repo="$2"

    if gh api "repos/$org/$repo/contents/$WORKFLOW_FILE" &> /dev/null; then
        return 0  # 存在する
    else
        return 1  # 存在しない
    fi
}

# デフォルトブランチを取得
get_default_branch() {
    local org="$1"
    local repo="$2"

    gh api "repos/$org/$repo" --jq '.default_branch'
}

# ワークフローを配布
distribute_workflow() {
    local org="$1"
    local repo="$2"

    info "Processing $org/$repo..."

    # 既存ワークフローのチェック
    if check_workflow_exists "$org" "$repo"; then
        warn "$org/$repo: Workflow already exists. Skipping."
        SKIP_REPOS+=("$repo")
        ((SKIP_COUNT++))
        return 0
    fi

    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY-RUN] Would create PR for $org/$repo"
        ((SUCCESS_COUNT++))
        SUCCESS_REPOS+=("$repo")
        return 0
    fi

    # デフォルトブランチを取得
    local default_branch
    default_branch=$(get_default_branch "$org" "$repo")
    if [[ -z "$default_branch" ]]; then
        error "$org/$repo: Failed to get default branch"
        ERROR_REPOS+=("$repo")
        ((ERROR_COUNT++))
        return 1
    fi

    # デフォルトブランチのSHAを取得
    local ref_sha
    ref_sha=$(gh api "repos/$org/$repo/git/refs/heads/$default_branch" --jq '.object.sha')
    if [[ -z "$ref_sha" ]]; then
        error "$org/$repo: Failed to get SHA for $default_branch"
        ERROR_REPOS+=("$repo")
        ((ERROR_COUNT++))
        return 1
    fi

    # ブランチが既に存在する場合の処理
    if gh api "repos/$org/$repo/git/refs/heads/$BRANCH_NAME" &> /dev/null; then
        if [[ "$FORCE_DELETE" == true ]]; then
            warn "$org/$repo: Branch $BRANCH_NAME already exists. Deleting with --force-delete..."
            local delete_output
            delete_output=$(gh api "repos/$org/$repo/git/refs/heads/$BRANCH_NAME" -X DELETE 2>&1)
            local delete_status=$?
            if [[ $delete_status -ne 0 ]]; then
                error "$org/$repo: Failed to delete branch $BRANCH_NAME (exit code: $delete_status)"
                error "gh output: $delete_output"
                SKIP_REPOS+=("$repo (delete failed)")
                ((SKIP_COUNT++))
                return 0
            fi
        else
            warn "$org/$repo: Branch $BRANCH_NAME already exists. Skipping (use --force-delete to override)"
            SKIP_REPOS+=("$repo (branch exists)")
            ((SKIP_COUNT++))
            return 0
        fi
    fi

    # ブランチ作成
    if ! gh api "repos/$org/$repo/git/refs" \
        -f ref="refs/heads/$BRANCH_NAME" \
        -f sha="$ref_sha" > /dev/null; then
        error "$org/$repo: Failed to create branch $BRANCH_NAME"
        ERROR_REPOS+=("$repo")
        ((ERROR_COUNT++))
        return 1
    fi

    # ワークフローファイルの内容をBase64エンコード（クロスプラットフォーム対応）
    local content_base64
    if command -v openssl &> /dev/null; then
        # opensslを優先（最も互換性が高い）
        content_base64=$(openssl base64 -A < "$WORKFLOW_SOURCE")
    elif base64 --help 2>&1 | grep -q -- '-w'; then
        # Linuxのbase64で-w0オプションをサポート
        content_base64=$(base64 -w0 < "$WORKFLOW_SOURCE")
    else
        # フォールバック：改行を削除
        content_base64=$(base64 < "$WORKFLOW_SOURCE" | tr -d '\n')
    fi

    # ファイル追加
    if ! gh api "repos/$org/$repo/contents/$WORKFLOW_FILE" \
        -X PUT \
        -f message="Add trigger-knowledge-collection workflow" \
        -f content="$content_base64" \
        -f branch="$BRANCH_NAME" > /dev/null; then
        error "$org/$repo: Failed to add workflow file"
        ERROR_REPOS+=("$repo")
        ((ERROR_COUNT++))
        return 1
    fi

    # PR本文
    local pr_body
    pr_body=$(cat <<'EOFPR'
## 概要
PRマージ時にレビュー知見を自動収集するワークフローを追加します。

## 変更内容
- `.github/workflows/trigger-knowledge-collection.yml` を追加

## 必要な設定
このワークフローを有効にするには、以下のシークレット設定が必要です：

1. Settings → Secrets and variables → Actions
2. 「New repository secret」をクリック
3. 名前: `ORG_GITHUB_TOKEN`
4. 値: Fine-grained Personal Access Token（Actions: Read/Write, Contents: Read/Write 権限）

---
Generated by distribute-workflow.sh
EOFPR
)

    # PR作成
    if ! gh pr create \
        --repo "$org/$repo" \
        --head "$BRANCH_NAME" \
        --base "$default_branch" \
        --title "Add knowledge collection trigger workflow" \
        --body "$pr_body" > /dev/null; then
        error "$org/$repo: Failed to create PR"
        ERROR_REPOS+=("$repo")
        ((ERROR_COUNT++))
        return 1
    fi

    info "$org/$repo: PR created successfully"
    SUCCESS_REPOS+=("$repo")
    ((SUCCESS_COUNT++))
}

# 結果サマリーを表示
show_summary() {
    echo ""
    echo "========================================="
    echo "Summary"
    echo "========================================="
    echo "Total:   $((SUCCESS_COUNT + SKIP_COUNT + ERROR_COUNT))"
    echo "Success: $SUCCESS_COUNT"
    echo "Skipped: $SKIP_COUNT"
    echo "Errors:  $ERROR_COUNT"
    echo ""

    if [[ ${#SUCCESS_REPOS[@]} -gt 0 ]]; then
        echo "Successfully created PRs:"
        printf '  - %s\n' "${SUCCESS_REPOS[@]}"
        echo ""
    fi

    if [[ ${#SKIP_REPOS[@]} -gt 0 ]]; then
        echo "Skipped (workflow already exists):"
        printf '  - %s\n' "${SKIP_REPOS[@]}"
        echo ""
    fi

    if [[ ${#ERROR_REPOS[@]} -gt 0 ]]; then
        echo "Failed:"
        printf '  - %s\n' "${ERROR_REPOS[@]}"
        echo ""
    fi
}

# メイン処理
main() {
    parse_args "$@"
    check_gh_cli

    # Secrets設定モード
    if [[ "$SETUP_SECRETS" == true ]]; then
        echo "========================================="
        echo "Setup Secrets"
        echo "========================================="

        # アカウントタイプ検出
        local account_type
        account_type=$(detect_account_type "$TARGET_ORG")

        if [[ "$account_type" == "unknown" ]]; then
            error "Account '$TARGET_ORG' not found"
            exit 1
        fi

        echo "Account Type: $account_type ($TARGET_ORG)"

        # Org Secrets モードのバリデーション
        if [[ "$ORG_SECRETS" == true ]]; then
            if [[ "$account_type" != "org" ]]; then
                error "--org-secrets requires an Organization (got: $account_type)"
                exit 1
            fi

            echo "Mode: Organization Secrets"
            echo ""

            # スコープチェック
            if ! check_gh_scopes; then
                exit 1
            fi

            # Admin権限チェック
            if ! check_org_admin "$TARGET_ORG"; then
                exit 1
            fi
        else
            echo "Mode: Repository Secrets"
            echo ""
        fi

        # リポジトリ一覧取得
        read_into_array all_repos get_repositories "$TARGET_ORG"

        if [[ ${#all_repos[@]} -eq 0 ]]; then
            error "No repositories found in $TARGET_ORG"
            exit 1
        fi

        # フィルタリング
        read_into_array target_repos filter_repositories "${all_repos[@]}"

        if [[ ${#target_repos[@]} -eq 0 ]]; then
            error "No target repositories after filtering"
            exit 1
        fi

        # dry-runモード
        if [[ "$DRY_RUN" == true ]]; then
            info "DRY-RUN mode: Would configure secrets for:"
            echo ""
            echo "Knowledge repo:"
            echo "  - $KNOWLEDGE_REPO_NAME"
            echo ""
            echo "Other repositories (ORG_GITHUB_TOKEN only):"
            for repo in "${target_repos[@]}"; do
                if [[ "$repo" != "$KNOWLEDGE_REPO_NAME" ]]; then
                    echo "  - $repo"
                fi
            done
            echo ""
            exit 0
        fi

        # Secret値を入力
        if ! prompt_secrets; then
            error "Failed to read secrets"
            exit 1
        fi

        # Secrets設定実行
        local setup_failed=0
        if [[ "$ORG_SECRETS" == true ]]; then
            setup_org_secrets "$TARGET_ORG" "$KNOWLEDGE_REPO_NAME" || setup_failed=$?
        else
            setup_repo_secrets "$TARGET_ORG" "$KNOWLEDGE_REPO_NAME" "${target_repos[@]}" || setup_failed=$?
        fi

        # 結果サマリー
        local configured=$((2 - setup_failed))
        echo "Total: $configured configured, $setup_failed failed"
        echo ""

        if [[ $setup_failed -gt 0 ]]; then
            error "Some secrets failed to configure"
            exit 1
        fi

        # ワークフロー配布に進むか確認
        echo -n "Proceed to distribute workflows? [y/N]: "
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            info "Secrets setup completed. Skipping workflow distribution."
            exit 0
        fi

        echo ""
        echo "========================================="
        echo "Distribute Workflows"
        echo "========================================="
        echo ""
    fi

    # Permissions設定モード
    if [[ "$SETUP_PERMISSIONS" == true ]]; then
        echo "========================================="
        echo "Setup Actions Permissions"
        echo "========================================="

        # アカウントタイプ検出（Secrets設定時に取得していれば再利用）
        if [[ -z "${account_type:-}" ]]; then
            local account_type
            account_type=$(detect_account_type "$TARGET_ORG")

            if [[ "$account_type" == "unknown" ]]; then
                error "Account '$TARGET_ORG' not found"
                exit 1
            fi

            echo "Account Type: $account_type ($TARGET_ORG)"
        fi

        # Org Permissions モードのバリデーション
        if [[ "$ORG_PERMISSIONS" == true ]]; then
            if [[ "$account_type" != "org" ]]; then
                error "--org-permissions requires an Organization (got: $account_type)"
                exit 1
            fi

            echo "Mode: Organization-level Permissions"
            echo ""

            # スコープチェック
            if ! check_gh_scopes; then
                exit 1
            fi

            # Admin権限チェック
            if ! check_org_admin "$TARGET_ORG"; then
                exit 1
            fi
        else
            echo "Mode: Repository-level Permissions"
            echo ""
        fi

        # dry-runモード（Org level）
        if [[ "$DRY_RUN" == true && "$ORG_PERMISSIONS" == true ]]; then
            info "DRY-RUN mode: Would configure org-level permissions for:"
            echo ""
            echo "Organization:"
            echo "  - $TARGET_ORG"
            echo ""
            echo "Settings:"
            echo "  - default_workflow_permissions: write"
            echo "  - can_approve_pull_request_reviews: true"
            echo ""
            exit 0
        fi

        # リポジトリ一覧取得（Repository-level の場合）
        # Secrets設定時に取得していれば再利用
        if [[ "$ORG_PERMISSIONS" != true ]]; then
            if [[ ${#all_repos[@]} -eq 0 ]]; then
                read_into_array all_repos get_repositories "$TARGET_ORG"

                if [[ ${#all_repos[@]} -eq 0 ]]; then
                    error "No repositories found in $TARGET_ORG"
                    exit 1
                fi

                # フィルタリング
                read_into_array target_repos filter_repositories "${all_repos[@]}"

                if [[ ${#target_repos[@]} -eq 0 ]]; then
                    error "No target repositories after filtering"
                    exit 1
                fi
            fi

            # dry-runモード（Repository level）
            if [[ "$DRY_RUN" == true ]]; then
                info "DRY-RUN mode: Would configure permissions for:"
                echo ""
                echo "Repositories:"
                for repo in "${target_repos[@]}"; do
                    echo "  - $repo"
                done
                echo ""
                echo "Settings:"
                echo "  - default_workflow_permissions: write"
                echo "  - can_approve_pull_request_reviews: true"
                echo ""
                exit 0
            fi
        fi

        # Permissions設定実行
        local setup_failed=0
        if [[ "$ORG_PERMISSIONS" == true ]]; then
            setup_org_permissions "$TARGET_ORG" || setup_failed=$?
        else
            setup_repo_permissions "$TARGET_ORG" "${target_repos[@]}" || setup_failed=$?
        fi

        # 結果サマリー
        if [[ "$ORG_PERMISSIONS" == true ]]; then
            if [[ $setup_failed -eq 0 ]]; then
                echo ""
                echo "Total: 1 configured, 0 failed"
            else
                echo ""
                echo "Total: 0 configured, 1 failed"
            fi
        else
            local configured=$((${#target_repos[@]} - setup_failed))
            echo "Total: $configured configured, $setup_failed failed"
        fi
        echo ""

        if [[ $setup_failed -gt 0 ]]; then
            error "Some permissions failed to configure"
            exit 1
        fi

        # ワークフロー配布に進むか確認
        echo -n "Proceed to distribute workflows? [y/N]: "
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            info "Permissions setup completed. Skipping workflow distribution."
            exit 0
        fi

        echo ""
        echo "========================================="
        echo "Distribute Workflows"
        echo "========================================="
        echo ""
    fi

    check_workflow_file

    if [[ "$DRY_RUN" == true ]]; then
        info "DRY-RUN mode enabled"
    fi

    # リポジトリ一覧取得（Secrets/Permissions設定時に取得していれば再利用）
    if [[ ${#all_repos[@]} -eq 0 ]]; then
        read_into_array all_repos get_repositories "$TARGET_ORG"

        if [[ ${#all_repos[@]} -eq 0 ]]; then
            error "No repositories found in $TARGET_ORG"
            exit 1
        fi

        # フィルタリング
        read_into_array target_repos filter_repositories "${all_repos[@]}"

        if [[ ${#target_repos[@]} -eq 0 ]]; then
            error "No target repositories after filtering"
            exit 1
        fi
    fi

    info "Target repositories: ${#target_repos[@]}"

    if [[ "$DRY_RUN" == true ]]; then
        echo ""
        echo "Target repositories:"
        printf '  - %s\n' "${target_repos[@]}"
        echo ""
        exit 0
    fi

    # 各リポジトリに配布
    local total=${#target_repos[@]}
    local current=0
    for repo in "${target_repos[@]}"; do
        ((current++))
        info "Processing repository $current/$total: $repo"
        distribute_workflow "$TARGET_ORG" "$repo" || true

        # レート制限対策: 次のリポジトリ処理前に待機
        if [[ $current -lt $total && $DELAY_SECONDS -gt 0 ]]; then
            sleep "$DELAY_SECONDS"
        fi
    done

    # サマリー表示
    show_summary
}

main "$@"
