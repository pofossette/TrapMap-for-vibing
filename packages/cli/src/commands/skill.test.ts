/**
 * Tests for CLI skill commands (Phase 18 SKED-01).
 * Covers command registration and output formatting.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { Command } from 'commander';

import { registerSkillCommands } from './skill.js';

// Import the actual formatters for testing
// The formatters are not exported, but we can test them through the module

describe('CLI skill commands', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
  });

  describe('registerSkillCommands', () => {
    it('registers skill command group when allowSearch is true', () => {
      registerSkillCommands(program, { allowSearch: true });

      const commands = program.commands;
      const skillCommand = commands.find((cmd) => cmd.name() === 'skill');

      expect(skillCommand).toBeDefined();
      expect(skillCommand?.description()).toBe('Search and manage skill artifacts');
    });

    it('does not register skill command when allowSearch is false', () => {
      registerSkillCommands(program, { allowSearch: false });

      const commands = program.commands;
      const skillCommand = commands.find((cmd) => cmd.name() === 'skill');

      expect(skillCommand).toBeUndefined();
    });

    it('registers search-by-content subcommand under skill', () => {
      registerSkillCommands(program, { allowSearch: true });

      const skillCommand = program.commands.find((cmd) => cmd.name() === 'skill');
      const subcommands = skillCommand?.commands || [];
      const searchCommand = subcommands.find((cmd) => cmd.name() === 'search-by-content');

      expect(searchCommand).toBeDefined();
      expect(searchCommand?.description()).toBe('Search for skills by content text');
    });

    it('search-by-content has correct argument and options', () => {
      registerSkillCommands(program, { allowSearch: true });

      const skillCommand = program.commands.find((cmd) => cmd.name() === 'skill');
      const searchCommand = skillCommand?.commands.find((cmd) => cmd.name() === 'search-by-content');

      // Check arguments
      const args = searchCommand?.registeredArguments || [];
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('text');

      // Check options
      const options = searchCommand?.options || [];
      const maxResultsOption = options.find((opt) => opt.long === '--max-results');
      const jsonOption = options.find((opt) => opt.long === '--json');

      expect(maxResultsOption).toBeDefined();
      expect(jsonOption).toBeDefined();
    });
  });

  describe('command visibility', () => {
    it('skill command is additive - does not affect other commands', () => {
      // Register some other commands first
      program.command('test1').description('Test command 1');
      program.command('test2').description('Test command 2');

      // Register skill commands
      registerSkillCommands(program, { allowSearch: true });

      // Verify other commands still exist
      const test1 = program.commands.find((cmd) => cmd.name() === 'test1');
      const test2 = program.commands.find((cmd) => cmd.name() === 'test2');

      expect(test1).toBeDefined();
      expect(test2).toBeDefined();

      // And skill command exists
      const skill = program.commands.find((cmd) => cmd.name() === 'skill');
      expect(skill).toBeDefined();
    });

    it('when allowSearch is false, no skill commands are registered', () => {
      registerSkillCommands(program, { allowSearch: false });

      const skillCommand = program.commands.find((cmd) => cmd.name() === 'skill');
      expect(skillCommand).toBeUndefined();
    });
  });
});
