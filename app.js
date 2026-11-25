import qrcode from "./vendor/qrcode.js";
import { pixCode, parseAmount } from "./pix.js";

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 10000; // typo guard (an extra zero), not a business rule: raise it freely
const PLACEHOLDER_KEY = "REPLACE-WITH-PIX-KEY";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const $ = (selector) => document.querySelector(selector);

const dialog = $("#contribution");
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
const { pix, suggestedAmounts, themes } = data;
let currentTheme;

// Fills the emoji, name and phrase of a theme: in its card and at the top of the dialog.
function showTheme(root, theme) {
  root.dataset.color = theme.color; // picks the pencil tint, see [data-color] in style.css
  root.querySelector(".disc").textContent = theme.emoji;
  root.querySelector(".theme-name").textContent = theme.name;
  root.querySelector(".theme-description").textContent = theme.description;
}

function showStep(step) {
  dialog.dataset.step = step; // style.css widens the dialog while paying
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

// A pill that fills in one suggested amount.
function suggestionButton(amount) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `R$ ${amount}`;
  button.addEventListener("click", () => {
    amountInput.value = String(amount);
    updateGenerateButton();
  });
  return button;
}

function openTheme(theme) {
  currentTheme = theme;
  showTheme($("#dialog-theme"), theme);
  // A theme can list its own suggested amounts. Without them, it gets the general list.
  $("#suggestions").replaceChildren(...(theme.suggestedAmounts ?? suggestedAmounts).map(suggestionButton));
  amountForm.reset();
  noteForm.reset();
  noteForm.hidden = false;
  $("#note-sent").hidden = true;
  $("#note-status").textContent = "";
  updateGenerateButton();
  showStep("amount");
  dialog.showModal();
}

// A click outside the dialog closes it. Such a click lands on the dialog element
// itself (its backdrop), outside its box. The press must start outside as well, so
// dragging a text selection out of the dialog does not close it.
let pressedOutside = false;
function isOutsideDialog(event) {
  const box = dialog.getBoundingClientRect();
  const insideBox =
    event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
  return event.target === dialog && !insideBox;
}
dialog.addEventListener("pointerdown", (event) => {
  pressedOutside = isOutsideDialog(event);
});
dialog.addEventListener("click", (event) => {
  if (pressedOutside && isOutsideDialog(event)) dialog.close();
});

// One card per theme: its gifts, and the button that opens the dialog.
for (const theme of themes) {
  const card = $("#theme-card").content.firstElementChild.cloneNode(true);
  showTheme(card, theme);
  for (const gift of theme.gifts) {
    card.querySelector("ul").append(Object.assign(document.createElement("li"), { textContent: gift }));
  }
  const button = card.querySelector("button");
  // Every card has the same button text, so a screen reader also hears the theme.
  button.setAttribute("aria-label", `${button.textContent}: ${theme.name}`);
  button.addEventListener("click", () => openTheme(theme));
  $("#themes").append(card);
}

// Step 1: amount.
amountInput.addEventListener("input", updateGenerateButton);

amountForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = readAmount();
  if (!amount) {
    $("#amount-error").textContent = `Digite um valor entre ${brl.format(MIN_AMOUNT)} e ${brl.format(MAX_AMOUNT)}.`;
    return;
  }
  const code = pixCode({ ...pix, amount, description: currentTheme.name, txid: currentTheme.id });
  const qr = qrcode(0, "M");
  qr.addData(code);
  qr.make();
  $("#qr").innerHTML = qr.createSvgTag({ scalable: true });
  $("#pix-code").value = code;
  $("#pay-amount").textContent = brl.format(amount);
  $("#copy-status").textContent = "";
  noteForm.elements.theme.value = currentTheme.name;
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
