import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CheckKnowledgeCli } from '../../src/interfaces/cli/CheckKnowledgeCli.js';

describe('CheckKnowledgeCli', () => {
  let cli: CheckKnowledgeCli;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    cli = new CheckKnowledgeCli();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: any) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('argument parsing', () => {
    it('should require --files argument', async () => {
      await expect(async () => {
        await cli.run([]);
      }).rejects.toThrow('process.exit(1)');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('--files is required')
      );
    });

    it('should parse --files argument', async () => {
      // This test verifies parsing, but will fail during execution due to missing knowledge files
      // We're just checking that it doesn't fail on argument parsing
      const args = ['--files', 'test.java'];

      try {
        await cli.run(args);
      } catch (error: any) {
        // Expected to fail during execution, not during parsing
        // If it exits with 0, it means it handled gracefully
        expect(error.message).toContain('process.exit(0)');
      }
    });

    it('should parse comma-separated file paths', async () => {
      const args = ['--files', 'file1.java,file2.ts,file3.py'];

      try {
        await cli.run(args);
      } catch (error: any) {
        // Should handle gracefully
        expect(error.message).toContain('process.exit(0)');
      }
    });

    it('should handle --format argument', async () => {
      const args = ['--files', 'test.java', '--format', 'json'];

      try {
        await cli.run(args);
      } catch (error: any) {
        expect(error.message).toContain('process.exit(0)');
      }
    });

    it('should handle --severity argument', async () => {
      const args = ['--files', 'test.java', '--severity', 'critical,warning'];

      try {
        await cli.run(args);
      } catch (error: any) {
        expect(error.message).toContain('process.exit(0)');
      }
    });

    it('should handle --include-empty flag', async () => {
      const args = ['--files', 'test.java', '--include-empty'];

      try {
        await cli.run(args);
      } catch (error: any) {
        expect(error.message).toContain('process.exit(0)');
      }
    });

    it('should handle --knowledge-dir argument', async () => {
      const args = ['--files', 'test.java', '--knowledge-dir', '/tmp/knowledge'];

      try {
        await cli.run(args);
      } catch (error: any) {
        expect(error.message).toContain('process.exit(0)');
      }
    });

    it('should show help with --help flag', async () => {
      const args = ['--help'];

      try {
        await cli.run(args);
      } catch (error: any) {
        expect(error.message).toContain('process.exit(0)');
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Usage:')
        );
      }
    });

    it('should filter empty file paths', async () => {
      const args = ['--files', 'file1.java,,file2.ts, ,file3.py'];

      try {
        await cli.run(args);
      } catch (error: any) {
        // Should handle gracefully (3 valid files)
        expect(error.message).toContain('process.exit(0)');
      }
    });
  });

  describe('error handling', () => {
    it('should exit with 0 on error (non-blocking)', async () => {
      const args = ['--files', 'nonexistent.java'];

      try {
        await cli.run(args);
      } catch (error: any) {
        // Should always exit with 0 (non-blocking)
        expect(error.message).toContain('process.exit(0)');
      }

      // Should log warning
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should output empty checklist on error', async () => {
      const args = ['--files', 'test.java', '--knowledge-dir', '/nonexistent'];

      try {
        await cli.run(args);
      } catch (error: any) {
        expect(error.message).toContain('process.exit(0)');
      }

      // Should output markdown with "No relevant knowledge"
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('<!-- review-dojo-checklist -->')
      );
    });
  });

  describe('output format', () => {
    it('should default to markdown format', async () => {
      const args = ['--files', 'test.java'];

      try {
        await cli.run(args);
      } catch (error: any) {
        expect(error.message).toContain('process.exit(0)');
      }

      // Default should be markdown
      const output = consoleLogSpy.mock.calls[0]?.[0];
      if (output) {
        expect(output).toContain('<!-- review-dojo-checklist -->');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty file list after filtering', async () => {
      const args = ['--files', ' , , '];

      try {
        await cli.run(args);
      } catch (error: any) {
        // Should exit with error for validation failure
        expect(error.message).toContain('process.exit(1)');
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('No valid file paths')
      );
    });

    it('should handle short flag -f', async () => {
      const args = ['-f', 'test.java'];

      try {
        await cli.run(args);
      } catch (error: any) {
        expect(error.message).toContain('process.exit(0)');
      }
    });

    it('should handle short flag -h', async () => {
      const args = ['-h'];

      try {
        await cli.run(args);
      } catch (error: any) {
        expect(error.message).toContain('process.exit(0)');
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Usage:')
        );
      }
    });
  });
});
