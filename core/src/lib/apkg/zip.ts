import { inflateRawSync } from "node:zlib";
import { ValidationError } from "../errors.js";

/**
 * A minimal zip reader for Anki packages. It reads the central directory,
 * refuses anything it does not understand (zip64, encryption, methods other
 * than stored/deflate) and inflates each entry with a hard output cap, so a
 * lying size field or a zip bomb fails instead of filling memory.
 */

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;
const MAX_ENTRIES = 200_000;

export function listZip(buf: Buffer): ZipEntry[] {
  // The end-of-central-directory record sits in the last 22 + 65535 bytes.
  const from = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new ValidationError("Not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  const cenSize = buf.readUInt32LE(eocd + 12);
  const cenOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cenOffset === 0xffffffff) throw new ValidationError("Zip64 packages are not supported");
  if (count > MAX_ENTRIES) throw new ValidationError("The package has too many files");
  if (cenOffset + cenSize > buf.length) throw new ValidationError("The zip directory is damaged");

  const entries: ZipEntry[] = [];
  let p = cenOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) throw new ValidationError("The zip directory is damaged");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    if (flags & 0x1) throw new ValidationError("Encrypted packages are not supported");
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({ name, method, compressedSize, size, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** The entry's bytes, never more than `maxBytes` whatever its header claims. */
export function readZipEntry(buf: Buffer, entry: ZipEntry, maxBytes: number): Buffer {
  const p = entry.localHeaderOffset;
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== LOC_SIG) throw new ValidationError(`Damaged zip entry ${entry.name}`);
  const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
  const end = start + entry.compressedSize;
  if (end > buf.length) throw new ValidationError(`Damaged zip entry ${entry.name}`);
  const raw = buf.subarray(start, end);
  if (entry.method === 0) {
    if (raw.length > maxBytes) throw new ValidationError(`${entry.name} exceeds the size limit`);
    return raw;
  }
  if (entry.method !== 8) throw new ValidationError(`Unsupported compression in ${entry.name}`);
  try {
    return inflateRawSync(raw, { maxOutputLength: maxBytes });
  } catch (err) {
    if (err instanceof RangeError || (err as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") {
      throw new ValidationError(`${entry.name} exceeds the size limit`);
    }
    throw new ValidationError(`Damaged zip entry ${entry.name}`);
  }
}
