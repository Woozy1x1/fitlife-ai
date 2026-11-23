import {el,errText,msg,state} from "./kern.js?v=5c0fb232ee";
import {loadAll} from "./start.js?v=5c0fb232ee";
import {$,VY,db} from "../lib/basis.js?v=5c0fb232ee";

// -----------------------------------
// Einkaufsliste
// -----------------------------------

export function setupShopping() {
  $("shopForm").addEventListener("submit",addItem);
  $("shopClear").addEventListener("click",clearDone);
}

export function renderShopping() {
  const list = $("shopList");
  list.replaceChildren();
  if(!state.items.length) {
    list.append(el("p",{class:"muted"},"Deine Einkaufsliste ist leer."));
    $("shopClear").classList.add("hidden");
    return;
  }
  const sorted = [...state.items].sort((a,b) => Number(a.done)-Number(b.done));
  for(const item of sorted) {
    const box = el("input",{type:"checkbox",checked:item.done,onchange:e => toggleItem(item,e.target)});
    list.append(el("label",{class:"shop-item"+(item.done ? " done" : "")},box,
      el("span",{},item.name),item.amount ? el("small",{class:"muted"},item.amount) : null));
  }
  $("shopClear").classList.toggle("hidden",!state.items.some(i => i.done));
}

async function addItem(event) {
  event.preventDefault();
  const uid = VY.uid;
  const name = $("shopName").value.trim();
  if(!uid || !name) return;
  const {error} = await db.from("shopping_items").insert({user_id:uid,name:name.slice(0,100),amount:$("shopAmount").value.trim().slice(0,40) || null});
  if(error) { msg("Speichern fehlgeschlagen: "+errText(error)); return; }
  $("shopName").value = ""; $("shopAmount").value = "";
  $("shopName").focus();
  await loadAll();
}

async function toggleItem(item,box) {
  box.disabled = true;
  const {error} = await db.from("shopping_items").update({done:box.checked}).eq("id",item.id).eq("user_id",VY.uid);
  box.disabled = false;
  if(error) { box.checked = !box.checked; msg("Ändern fehlgeschlagen: "+errText(error)); return; }
  item.done = box.checked;
  renderShopping();
}

async function clearDone() {
  const uid = VY.uid;
  if(!uid) return;
  const {error} = await db.from("shopping_items").delete().eq("user_id",uid).eq("done",true);
  if(error) { msg("Löschen fehlgeschlagen: "+errText(error)); return; }
  await loadAll();
}
