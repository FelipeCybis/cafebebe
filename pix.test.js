// Run with: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { pixCode, parseAmount, toAscii } from "./pix.js";

// Splits a BR Code into its top-level fields and fails if any length prefix is wrong.
function parseFields(code) {
  const fields = {};
  let i = 0;
  while (i < code.length) {
    const length = Number(code.slice(i + 2, i + 4));
    fields[code.slice(i, i + 2)] = code.slice(i + 4, i + 4 + length);
    i += 4 + length;
  }
  assert.equal(i, code.length, "length prefixes must add up to the whole code");
  return fields;
}

test("pixCode reproduces the python-brcode reference payload", () => {
  const code = pixCode({
    key: "vpaivatorres@gmail.com",
    name: "Victor Torres",
    city: "Natal",
    amount: 10,
    description: "Biblioteca python-brcode",
  });
  assert.equal(
    code,
    "00020126720014br.gov.bcb.pix0122vpaivatorres@gmail.com0224Biblioteca python-brcode520400005303986540510.005802BR5913Victor Torres6005Natal62070503***6304C1FA",
  );
});

test("pixCode stays valid with emoji, accents and a long description", () => {
  const code = pixCode({
    key: "123e4567-e89b-12d3-a456-426614174000",
    name: "José da Conceição Araújo Albuquerque",
    city: "São José dos Campos",
    amount: 150.5,
    description: "Carrinho de bebê 🍼 – o modelo mais completo que existe nº 1",
    txid: "baby-monitor",
  });
  assert.match(code, /^[\x20-\x7e]+$/);
  const fields = parseFields(code);
  assert.ok(fields["26"].length <= 99);
  assert.equal(fields["54"], "150.50");
  assert.equal(fields["59"], "Jose da Conceicao Araujo");
  assert.equal(fields["60"], "Sao Jose dos Ca");
  assert.equal(fields["62"], "0511babymonitor");
});

test("toAscii removes accents and non-ASCII characters", () => {
  assert.equal(toAscii("Carrinho de bebê 🍼"), "Carrinho de bebe");
  assert.equal(toAscii("Fraldas – tamanho P"), "Fraldas tamanho P");
  assert.equal(toAscii("Maçã & pêra"), "Maca & pera");
});

test("parseAmount reads Brazilian amounts and rejects ambiguous input", () => {
  const accepted = { "150": 150, "150,50": 150.5, "1.500,00": 1500, "2.000": 2000, "150.50": 150.5, "R$ 1 500,00": 1500, "0,99": 0.99 };
  for (const [text, amount] of Object.entries(accepted)) assert.equal(parseAmount(text), amount, text);
  for (const text of ["", "abc", "-5", "1,500", "1,500.00", "1e3", "0x10", "Infinity", "100 reais", "1,2,3"]) {
    assert.ok(Number.isNaN(parseAmount(text)), text);
  }
});
