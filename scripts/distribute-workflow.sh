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
mainブランチに直接pushせず、PRを作成します。

Options:
  --dry-run           実際には変更せず、対象リポジトリを表示
  --repos <list>      特定のリポジトリのみを対象（カンマ区切り）
  --exclude <list>    追加で除外するリポジトリ（カンマ区切り）
  --branch <name>     作成するブランチ名（デフォルト: $DEFAULT_BRANCH_NAME）
  --force-delete      既存ブランチを確認なしで削除
  --delay <seconds>   各リポジトリ処理後の待機時間（デフォルト: 2秒）
  --no-delay          待機時間なし（高速モード、レート制限注意）
  -h, --help          このヘルプを表示

Examples:
  # dry-runで確認
  $(basename "$0") --dry-run sk8metalme

  # 特定リポジトリのみ
  $(basename "$0") --repos "repo1,repo2" sk8metalme

  # 実行
  $(basename "$0") sk8metalme

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
4. 値: 適切な権限を持つPersonal Access Token（repo, workflow スコープ）

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
    check_workflow_file

    if [[ "$DRY_RUN" == true ]]; then
        info "DRY-RUN mode enabled"
    fi

    # リポジトリ一覧取得
    mapfile -t all_repos < <(get_repositories "$TARGET_ORG")

    if [[ ${#all_repos[@]} -eq 0 ]]; then
        error "No repositories found in $TARGET_ORG"
        exit 1
    fi

    # フィルタリング
    mapfile -t target_repos < <(filter_repositories "${all_repos[@]}")

    if [[ ${#target_repos[@]} -eq 0 ]]; then
        error "No target repositories after filtering"
        exit 1
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
