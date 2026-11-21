// Builds the static Pix "copia e cola" payload (BR Code, an EMV QR format).

const field = (id, value) => id + String(value.length).padStart(2, "0") + value;

// CRC-16/CCITT-FALSE over the UTF-8 bytes, as 4 uppercase hex digits.
function crc16(text) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Removes accents, then drops whatever is still not printable ASCII (emoji,
// dashes, "º"). The length prefixes count bytes, so every value must be ASCII.
export function toAscii(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// key, name and city come from the bank account. amount is a number in reais.
// description is shown by some bank apps. txid is echoed back to the receiver.
export function pixCode({ key, name, city, amount, description = "", txid = "" }) {
  // Field 26 holds at most 99 characters: 26 of fixed overhead, the key, the description.
  const room = Math.max(0, 73 - key.length);
  const info = toAscii(description).slice(0, room).trim();
  const account = field("00", "br.gov.bcb.pix") + field("01", key) + (info ? field("02", info) : "");
  // "***" is the standard value for "no transaction id".
  const id = txid.replace(/[^a-zA-Z0-9]/g, "").slice(0, 25) || "***";
  const payload =
    field("00", "01") +
    field("26", account) +
    field("52", "0000") +
    field("53", "986") +
    (amount ? field("54", amount.toFixed(2)) : "") +
    field("58", "BR") +
    field("59", toAscii(name).slice(0, 25).trim()) +
    field("60", toAscii(city).slice(0, 15).trim()) +
    field("62", field("05", id)) +
    "6304";
  return payload + crc16(payload);
}

// Reads an amount typed the Brazilian way: "150", "150,50", "1.500,00", "2.000",
// and also "150.50". Returns NaN for anything else, so ambiguous input such as
// "1,500.00" or "1e3" is rejected instead of guessed.
export function parseAmount(text) {
  const t = text.replace(/R\$|\s/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^\d+([.,]\d{1,2})?$/.test(t)) return Number(t.replace(",", "."));
  return NaN;
}
