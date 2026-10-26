import { describe, expect, it } from 'vitest';
import {
  DomainError,
  IllegalTransitionError,
  NotFoundError,
  PermissionDeniedError,
  QuotaExceededError,
  TerminalStateError,
} from './errors';

describe('domain errors', () => {
  it('sets the error name to the concrete subclass', () => {
    expect(new NotFoundError('nope').name).toBe('NotFoundError');
    expect(new PermissionDeniedError('nope').name).toBe('PermissionDeniedError');
    expect(new IllegalTransitionError('nope').name).toBe('IllegalTransitionError');
    expect(new TerminalStateError('nope').name).toBe('TerminalStateError');
    expect(new QuotaExceededError('nope').name).toBe('QuotaExceededError');
  });

  it('treats every expected error as a DomainError', () => {
    expect(new NotFoundError('nope')).toBeInstanceOf(DomainError);
    expect(new TerminalStateError('nope')).toBeInstanceOf(DomainError);
  });

  it('keeps the message on the error', () => {
    expect(new IllegalTransitionError('Closed reports cannot be edited.').message).toBe(
      'Closed reports cannot be edited.',
    );
  });
});
