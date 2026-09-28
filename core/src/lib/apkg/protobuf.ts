import { ValidationError } from "../errors.js";

/**
 * Just enough protobuf to read Anki's package metadata, media map and the
 * config blobs of schema-18 note types, templates and decks. Fields are
 * returned in wire order; repeated fields simply appear more than once.
 */

export type PbValue = { wire: 0; value: bigint } | { wire: 2; value: Buffer } | { wire: 1 | 5; value: Buffer };
export type PbField = { field: number } & PbValue;

function readVarint(buf: Buffer, pos: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  for (let i = 0; i < 10; i++) {
    if (pos >= buf.length) throw new ValidationError("Damaged protobuf data");
    const byte = buf[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [result, pos];
    shift += 7n;
  }
  throw new ValidationError("Damaged protobuf data");
}

export function parseMessage(buf: Buffer): PbField[] {
  const out: PbField[] = [];
  let pos = 0;
  while (pos < buf.length) {
    const [key, next] = readVarint(buf, pos);
    pos = next;
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (wire === 0) {
      const [v, n] = readVarint(buf, pos);
      pos = n;
      out.push({ field, wire: 0, value: v });
    } else if (wire === 2) {
      const [len, n] = readVarint(buf, pos);
      const end = n + Number(len);
      if (end > buf.length) throw new ValidationError("Damaged protobuf data");
      out.push({ field, wire: 2, value: buf.subarray(n, end) });
      pos = end;
    } else if (wire === 1 || wire === 5) {
      const size = wire === 1 ? 8 : 4;
      if (pos + size > buf.length) throw new ValidationError("Damaged protobuf data");
      out.push({ field, wire, value: buf.subarray(pos, pos + size) });
      pos += size;
    } else {
      throw new ValidationError("Damaged protobuf data");
    }
  }
  return out;
}

export function pbInt(fields: PbField[], n: number, fallback = 0): number {
  const f = fields.find(x => x.field === n && x.wire === 0);
  return f ? Number(f.value) : fallback;
}

export function pbString(fields: PbField[], n: number, fallback = ""): string {
  const f = fields.find(x => x.field === n && x.wire === 2);
  return f ? (f.value as Buffer).toString("utf8") : fallback;
}

export function pbBytes(fields: PbField[], n: number): Buffer[] {
  return fields.filter(x => x.field === n && x.wire === 2).map(x => x.value as Buffer);
}

export function pbHas(fields: PbField[], n: number): boolean {
  return fields.some(x => x.field === n);
}
