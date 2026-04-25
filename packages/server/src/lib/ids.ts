import { customAlphabet } from 'nanoid';

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 12;

const generateIdSegment = customAlphabet(ID_ALPHABET, ID_LENGTH);

export function createPrefixedId(prefix: string): string {
  return `${prefix}_${generateIdSegment()}`;
}

export function createQueryId(): string {
  return createPrefixedId('qry');
}

export function createDuplicateCaseId(): string {
  return createPrefixedId('dupcase');
}
