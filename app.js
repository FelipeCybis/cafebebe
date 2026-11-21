import qrcode from "./vendor/qrcode.js";
import { pixCode, parseAmount } from "./pix.js";

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 10000; // typo guard (an extra zero), not a business rule: raise it freely
const PLACEHOLDER_KEY = "REPLACE-WITH-PIX-KEY";
// Must match the [data-color] rules in style.css. Seven never lines up with a
// grid of 2 to 6 columns, so the colors do not form vertical stripes.
const DISC_COLORS = 7;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const $ = (selector) => document.querySelector(selector);

const dialog = $("#gift-dialog");
const amountForm = $("#amount-form");
const amountInput = $("#amount");
const noteForm = $("#note-form");

let data;
try {
  data = await (await fetch("gifts.json")).json();
} catch (error) {
  $("#load-error").hidden = false;
  throw error;
}
const { pix, suggestedAmounts, gifts } = data;
let currentGift;

// Fills the disc, name and description of a gift, in a card or in the dialog.
function showGift(root, gift, color) {
  root.dataset.color = color;
  const disc = root.querySelector(".disc");
  if (gift.photo) {
    const image = new Image();
    image.src = gift.photo;
    image.alt = "";
    disc.replaceChildren(image);
  } else {
    disc.textContent = gift.emoji ?? "🎁";
  }
  root.querySelector(".gift-name").textContent = gift.name;
  root.querySelector(".gift-description").textContent = gift.description ?? "";
}

function showStep(step) {
  amountForm.hidden = step !== "amount";
  $("#pay").hidden = step !== "pay";
}

// Returns the typed amount, or null if it is not a valid amount within the limits.
function readAmount() {
  const amount = parseAmount(amountInput.value);
  return amount >= MIN_AMOUNT && amount <= MAX_AMOUNT ? amount : null;
}

// The button repeats the formatted amount, so the guest confirms it with the click.
function updateGenerateButton() {
  const amount = readAmount();
  $("#generate").textContent = amount ? `Gerar Pix de ${brl.format(amount)}` : "Gerar Pix";
  $("#amount-error").textContent = "";
}

function openGift(gift, color) {
  currentGift = gift;
  showGift(dialog, gift, color);
  amountForm.reset();
  noteForm.reset();
  noteForm.hidden = false;
  $("#note-sent").hidden = true;
  $("#note-status").textContent = "";
  updateGenerateButton();
  showStep("amount");
  dialog.showModal();
}

// Gift grid.
gifts.forEach((gift, index) => {
  const item = $("#gift-card").content.firstElementChild.cloneNode(true);
  const color = index % DISC_COLORS;
  showGift(item, gift, color);
  item.dataset.category = gift.category ?? "";
  if (gift.referencePrice) {
    item.querySelector(".gift-price").textContent = `Custa uns ${brl.format(gift.referencePrice)}`;
  }
  item.querySelector("button").addEventListener("click", () => openGift(gift, color));
  $("#gifts").append(item);
});

// Category filter. A gift without a category shows under every filter.
const categories = [...new Set(gifts.map((gift) => gift.category).filter(Boolean))];
for (const category of ["", ...categories]) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = category || "Todos";
  button.setAttribute("aria-pressed", String(!category));
  button.addEventListener("click", () => {
    for (const other of $("#filters").children) other.setAttribute("aria-pressed", String(other === button));
    for (const item of $("#gifts").children) {
      item.hidden = Boolean(category && item.dataset.category && item.dataset.category !== category);
    }
  });
  $("#filters").append(button);
}

// Step 1: amount.
for (const amount of suggestedAmounts) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `R$ ${amount}`;
  button.addEventListener("click", () => {
    amountInput.value = String(amount);
    updateGenerateButton();
  });
  $("#suggestions").append(button);
}

amountInput.addEventListener("input", updateGenerateButton);

amountForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = readAmount();
  if (!amount) {
    $("#amount-error").textContent = `Digite um valor entre ${brl.format(MIN_AMOUNT)} e ${brl.format(MAX_AMOUNT)}.`;
    return;
  }
  const code = pixCode({ ...pix, amount, description: currentGift.name, txid: currentGift.id });
  const qr = qrcode(0, "M");
  qr.addData(code);
  qr.make();
  $("#qr").innerHTML = qr.createSvgTag({ scalable: true });
  $("#pix-code").value = code;
  $("#pay-amount").textContent = brl.format(amount);
  $("#copy-status").textContent = "";
  noteForm.elements.gift.value = currentGift.name;
  noteForm.elements.amount.value = brl.format(amount);
  showStep("pay");
});

// Step 2: pay.
$("#payee").textContent = pix.name;
$("#placeholder-warning").hidden = pix.key !== PLACEHOLDER_KEY;
$("#change-amount").addEventListener("click", () => showStep("amount"));

$("#copy").addEventListener("click", async () => {
  const code = $("#pix-code");
  try {
    await navigator.clipboard.writeText(code.value);
    $("#copy-status").textContent = "Código copiado. Agora cole no app do seu banco.";
  } catch {
    // Some in-app browsers block the clipboard: leave the code selected for a manual copy.
    code.select();
    $("#copy-status").textContent = "Não deu para copiar sozinho. Segure o dedo no código abaixo e copie.";
  }
});

// Note to the parents, sent as an email by Web3Forms.
noteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = noteForm.querySelector("button");
  button.disabled = true;
  let sent = false;
  try {
    const response = await fetch(noteForm.action, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(noteForm),
    });
    sent = (await response.json()).success === true;
  } catch {
    // Network or service error: reported below.
  }
  button.disabled = false;
  noteForm.hidden = sent;
  $("#note-sent").hidden = !sent;
  $("#note-status").textContent = sent ? "" : "O recado não foi enviado. Confira a internet e envie de novo.";
});
