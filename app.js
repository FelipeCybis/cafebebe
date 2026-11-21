import qrcode from "./vendor/qrcode.js";
import { pixCode, parseAmount } from "./pix.js";

const MIN_AMOUNT = 1;
const MAX_AMOUNT = 10000; // typo guard (an extra zero), not a business rule: raise it freely
const PLACEHOLDER_KEY = "REPLACE-WITH-PIX-KEY";
// Must match the [data-color] rules in style.css. Seven never lines up with a
// grid of 2 to 6 columns, so the colors do not form vertical stripes.
const DISC_COLORS = 7;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlRounded = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
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
  root.querySelector(".disc").textContent = gift.emoji ?? "🎁";
  root.querySelector(".gift-name").textContent = gift.name;
  root.querySelector(".gift-description").textContent = gift.description ?? "";
}

// In the dialog, a gift with a "photo" shows it in place of the emoji disc.
// The photo usually lives on the store's site, so if it stops loading the disc comes back.
function showPhoto(gift) {
  const photo = $("#gift-photo");
  photo.replaceChildren();
  dialog.classList.toggle("has-photo", Boolean(gift.photo));
  if (!gift.photo) return;
  const image = new Image();
  image.alt = "";
  image.referrerPolicy = "no-referrer"; // the store does not need to learn this page's address
  image.addEventListener("error", () => {
    if (!image.isConnected) return; // another gift was opened meanwhile
    dialog.classList.remove("has-photo");
    image.remove();
  });
  image.src = gift.photo;
  photo.append(image);
}

// Latest rate from a currency to BRL. First the European Central Bank reference
// rate, served by frankfurter.dev. That service has gone down before, so a daily
// rate file on the jsDelivr CDN is the second try. Resolves to null if both fail.
async function fetchRateToBrl(currency) {
  const code = currency.toLowerCase();
  const sources = [
    [`https://api.frankfurter.dev/v1/latest?base=${currency}&symbols=BRL`, (data) => data.rates.BRL],
    [`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${code}.min.json`, (data) => data[code].brl],
  ];
  for (const [url, readRate] of sources) {
    try {
      const rate = readRate(await (await fetch(url)).json());
      if (rate > 0) return rate;
    } catch {
      // Try the next source.
    }
  }
  return null;
}

// One lookup per currency per visit.
const rates = {};
const rateToBrl = (currency) => (rates[currency] ??= fetchRateToBrl(currency));

// Shows the store price. A price in another currency also gets its value in BRL,
// added once the rate arrives. Without a rate, the store price stays alone.
async function showPrice(gift) {
  const line = $("#gift-price");
  line.textContent = "";
  if (!gift.price) return;
  const currency = gift.currency ?? "BRL";
  const price = new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(gift.price);
  line.textContent = `Custa ${price}`;
  if (currency === "BRL") return;
  const rate = await rateToBrl(currency);
  if (rate && currentGift === gift) {
    line.textContent = `Custa ${price}, cerca de ${brlRounded.format(gift.price * rate)}`;
  }
}

function showStep(step) {
  dialog.dataset.step = step; // style.css hides the photo, price and store link while paying
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
  showPhoto(gift);
  showPrice(gift);
  $("#gift-link").hidden = !gift.url;
  if (gift.url) $("#gift-link").href = gift.url;
  amountForm.reset();
  noteForm.reset();
  noteForm.hidden = false;
  $("#note-sent").hidden = true;
  $("#note-status").textContent = "";
  updateGenerateButton();
  showStep("amount");
  dialog.showModal();
}

// Gift carousel: two rows that slide sideways, by swipe or with the arrows.
const scroller = $("#gifts");
const list = scroller.querySelector("ul");

// Shows the gifts of one category, or all of them. A gift without a category
// shows under every filter.
function renderGifts(category) {
  list.replaceChildren();
  gifts.forEach((gift, index) => {
    if (category && gift.category && gift.category !== category) return;
    const item = $("#gift-card").content.firstElementChild.cloneNode(true);
    const color = index % DISC_COLORS;
    showGift(item, gift, color);
    item.querySelector("button").addEventListener("click", () => openGift(gift, color));
    list.append(item);
  });
  scroller.scrollLeft = 0;
  updateArrows();
}

// The arrows hide when the whole list fits in view, and each one fades when
// there is nothing more on its side.
function updateArrows() {
  const end = scroller.scrollWidth - scroller.clientWidth;
  $(".carousel").classList.toggle("slides", end > 1);
  $("#previous").setAttribute("aria-disabled", String(scroller.scrollLeft <= 1));
  $("#next").setAttribute("aria-disabled", String(scroller.scrollLeft >= end - 1));
}
scroller.addEventListener("scroll", updateArrows);
window.addEventListener("resize", updateArrows);

// The arrows slide by one view of whole columns.
function slide(direction) {
  const column = list.firstElementChild.getBoundingClientRect().width;
  const step = column + parseFloat(getComputedStyle(list).columnGap);
  const columnsInView = Math.max(1, Math.floor((scroller.clientWidth + 2) / step));
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollBy({ left: direction * columnsInView * step, behavior: reducedMotion ? "auto" : "smooth" });
}
$("#previous").addEventListener("click", () => slide(-1));
$("#next").addEventListener("click", () => slide(1));

renderGifts("");

// Category filter.
const categories = [...new Set(gifts.map((gift) => gift.category).filter(Boolean))];
for (const category of ["", ...categories]) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = category || "Todos";
  button.setAttribute("aria-pressed", String(!category));
  button.addEventListener("click", () => {
    for (const other of $("#filters").children) other.setAttribute("aria-pressed", String(other === button));
    renderGifts(category);
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
