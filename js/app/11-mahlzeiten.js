// VYORA AI – Ernährung: Mahlzeiten speichern und anzeigen
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Mahlzeiten speichern
// -----------------------------------

$("nutritionForm").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const button = $("saveMeal");
    button.disabled = true;

    nutritionMessage(
      "Mahlzeit wird gespeichert ..."
    );

    try {
      // Offline reicht die angemeldete Sitzung auf diesem Gerät.
      const user = currentUserId ? {id:currentUserId} : null;

      if(!user) {
        throw new Error(
          "Bitte erneut anmelden."
        );
      }

      const fields = [
        "calories",
        "protein",
        "carbs",
        "fat"
      ];

      const values = {};

      for(const field of fields) {
        const value = Number($(field).value);

        if(
          $(field).value.trim()==="" ||
          !Number.isFinite(value) ||
          value<0 ||
          value>999999
        ) {
          throw new Error(
            "Bitte gültige Nährwerte eingeben."
          );
        }

        values[field] = value;
      }

      // Ballaststoffe: freiwillig
      const fiberRaw = $("fiber") ? $("fiber").value.trim() : "";
      if(fiberRaw!=="") {
        const fiber = Number(fiberRaw);
        if(!Number.isFinite(fiber) || fiber<0 || fiber>999) {
          throw new Error("Bitte gültige Ballaststoffe eingeben (oder leer lassen).");
        }
        values.fiber_g = fiber;
      }

      const foodName =
        $("foodName").value.trim();

      if(
        !foodName ||
        foodName.length>200
      ) {
        throw new Error(
          "Bitte einen gültigen Namen eingeben."
        );
      }

      const amount = Number(
        $("foodAmount").value
      );

      if(
        !Number.isFinite(amount) ||
        amount<=0 ||
        amount>100000
      ) {
        throw new Error(
          "Bitte eine gültige Menge eingeben."
        );
      }

      // Die bestehende Tabelle hat noch
      // keine eigene Gramm-Spalte.
      // Die Menge wird deshalb im Namen
      // gespeichert, ohne die DB zu ändern.
      const savedName =
        `${foodName} (${number(amount)} g)`;

      if(savedName.length>200) {
        throw new Error(
          "Der Lebensmittelname ist zu lang."
        );
      }

      const date =
        $("nutritionDate").value;

      const saved = await saveOrQueue("nutrition_entries",{
          user_id:user.id,
          meal_type:$("mealType").value,
          food_name:savedName,
          entry_date:date,
          ...values
        });

      clearFoodSelection();
      if(saved.queued) { nutritionMessage(OFFLINE_MSG); return; }

      await loadNutrition();

      nutritionMessage(
        "✓ Mahlzeit erfolgreich gespeichert."
      );

    } catch(error) {
      nutritionMessage(
        "Speichern fehlgeschlagen: "+
        error.message
      );
    } finally {
      button.disabled = false;
    }
  }
);

async function deleteMeal(id) {
  if(!confirm(
    "Diese Mahlzeit wirklich löschen?"
  )) return;

  nutritionMessage(
    "Eintrag wird gelöscht ..."
  );

  const {error} = await supabase
    .from("nutrition_entries")
    .delete()
    .eq("id",id)
    .eq("user_id",currentUserId);

  if(error) {
    nutritionMessage(
      "Löschen fehlgeschlagen: "+
      error.message
    );
    return;
  }

  await loadNutrition();

  nutritionMessage(
    "✓ Eintrag gelöscht."
  );
}
