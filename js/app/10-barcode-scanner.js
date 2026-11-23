// VYORA AI – Ernährung: Barcode-Scanner (Kamera)
// Alle Teile teilen sich einen gemeinsamen Bereich
// und werden in index.html der Reihe nach geladen (siehe js/app/LIESMICH.md).
"use strict";

// -----------------------------------
// Barcode-Scanner (Kamera)
// Das Bild wird nur im Browser ausgewertet.
// Es wird nichts gespeichert oder hochgeladen.
// -----------------------------------

const ZXING_SRC =
  "./vendor/zxing-library-0.21.3.min.js";

let scanStream = null;
let scanRun = 0;
let zxingPromise = null;

function loadZxing() {
  if(window.ZXing) return Promise.resolve(window.ZXing);

  if(!zxingPromise) {
    zxingPromise = new Promise((resolve,reject) => {
      const script = document.createElement("script");
      script.src = ZXING_SRC;
      script.async = true;
      script.onload = () =>
        window.ZXing
          ? resolve(window.ZXing)
          : reject(new Error("Scanner fehlt"));
      script.onerror = () => {
        zxingPromise = null;
        reject(new Error("Scanner konnte nicht geladen werden"));
      };
      document.head.append(script);
    });
  }

  return zxingPromise;
}

async function createDecoder() {
  // 1. Eingebaute Barcode-Erkennung
  //    (Chrome/Android, Edge, Samsung Internet)
  if("BarcodeDetector" in window) {
    try {
      const supported =
        await window.BarcodeDetector.getSupportedFormats();
      const formats = [
        "ean_13","ean_8","upc_a","upc_e"
      ].filter(f => supported.includes(f));

      if(formats.length) {
        const detector =
          new window.BarcodeDetector({formats});
        return async video => {
          const codes = await detector.detect(video);
          return codes.length ? codes[0].rawValue : null;
        };
      }
    } catch(_error) {
      // weiter mit dem Ersatz-Scanner
    }
  }

  // 2. Ersatz für iPhone/Firefox: ZXing,
  //    liegt als Datei in unserem Repository.
  const ZXing = await loadZxing();

  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[
    ZXing.BarcodeFormat.EAN_13,
    ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A,
    ZXing.BarcodeFormat.UPC_E
  ]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER,true);

  const reader = new ZXing.MultiFormatReader();
  reader.setHints(hints);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d",{
    willReadFrequently:true
  });

  return async video => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if(!width || !height) return null;

    // Für die Geschwindigkeit verkleinern.
    const scale = Math.min(1,800/width);
    canvas.width = Math.round(width*scale);
    canvas.height = Math.round(height*scale);
    context.drawImage(
      video,0,0,canvas.width,canvas.height
    );

    try {
      const source =
        new ZXing.HTMLCanvasElementLuminanceSource(canvas);
      const bitmap = new ZXing.BinaryBitmap(
        new ZXing.HybridBinarizer(source)
      );
      return reader.decode(bitmap).getText();
    } catch(_notFound) {
      return null;
    } finally {
      reader.reset();
    }
  };
}

function stopScanner() {
  scanRun++;

  if(scanStream) {
    scanStream.getTracks().forEach(track => track.stop());
    scanStream = null;
  }

  const video = $("scanVideo");
  video.pause();
  video.srcObject = null;

  $("scanBox").classList.add("hidden");
  $("scanStop").classList.add("hidden");
  $("scanButton").classList.remove("hidden");
}

async function startScanner() {
  if(
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    foodMessage(
      "Dein Browser erlaubt hier keinen Kamerazugriff. Bitte tippe den Barcode unten ein."
    );
    return;
  }

  stopScanner();
  const run = scanRun;

  $("scanButton").classList.add("hidden");
  $("scanStop").classList.remove("hidden");
  foodMessage("Kamera wird gestartet ...");

  let decode;
  let stream = null;

  try {
    // Scanner zuerst laden: Schlägt das fehl,
    // wird die Kamera gar nicht erst geöffnet.
    decode = await createDecoder();
    if(run!==scanRun) return;

    stream = await navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{
        facingMode:{ideal:"environment"},
        width:{ideal:1280},
        height:{ideal:720}
      }
    });

    if(run!==scanRun) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }

    scanStream = stream;

    const video = $("scanVideo");
    video.srcObject = stream;
    $("scanBox").classList.remove("hidden");
    await video.play();

  } catch(error) {
    // Kamera in jedem Fall wieder freigeben.
    if(stream && stream!==scanStream) {
      stream.getTracks().forEach(t => t.stop());
    }
    if(run!==scanRun) return;
    stopScanner();

    const denied =
      error && (
        error.name==="NotAllowedError" ||
        error.name==="SecurityError"
      );

    foodMessage(
      denied
        ? "Kamerazugriff wurde nicht erlaubt. Du kannst ihn in den Browser-Einstellungen freigeben oder den Barcode unten eintippen."
        : "Kamera oder Scanner konnte nicht gestartet werden. Bitte tippe den Barcode unten ein."
    );
    return;
  }

  foodMessage(
    "Halte den Barcode in den grünen Rahmen ..."
  );

  // Ein Treffer zählt erst, wenn derselbe Code
  // zweimal hintereinander gelesen wurde.
  let lastCode = "";
  const started = Date.now();

  while(run===scanRun) {
    const video = $("scanVideo");

    if(video.readyState>=2) {
      let code = null;

      try {
        code = await decode(video);
      } catch(_error) {
        code = null;
      }

      if(run!==scanRun) return;

      if(code && validBarcode(code)) {
        if(code===lastCode) {
          if(navigator.vibrate) navigator.vibrate(80);
          stopScanner();
          $("barcodeInput").value = code;
          lookupBarcode(code);
          return;
        }
        lastCode = code;
      }
    }

    if(Date.now()-started>60000) {
      stopScanner();
      foodMessage(
        "Kein Barcode erkannt. Versuche es mit mehr Licht oder tippe die Ziffern unten ein."
      );
      return;
    }

    await wait(180);
  }
}

$("scanButton").addEventListener("click",startScanner);
$("scanStop").addEventListener("click",() => {
  stopScanner();
  foodMessage("");
});

// Kamera nicht im Hintergrund weiterlaufen lassen.
document.addEventListener("visibilitychange",() => {
  if(document.hidden && scanStream) stopScanner();
});

function sortFoods(foods,query) {
  const q = query.toLowerCase();
  const seen = new Set();

  return foods
    .filter(food => {
      const id = food.code ||
        food.name+"|"+food.brand;
      if(seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((food,index) => {
      const name = food.name.toLowerCase();
      const rank =
        name===q ? 0 :
        name.startsWith(q) ? 1 :
        name.includes(q) ? 2 : 3;
      return {food,rank,index};
    })
    .sort((a,b) =>
      a.rank-b.rank || a.index-b.index
    )
    .map(entry => entry.food);
}

$("foodSearchForm").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const query = $("foodSearch").value.trim();

    if(query.length<2) {
      foodMessage(
        "Bitte mindestens zwei Zeichen eingeben."
      );
      return;
    }

    const requestId = ++foodSearchCounter;
    const button = $("foodSearchButton");

    button.disabled = true;
    foodMessage("Lebensmittel werden gesucht ...");
    $("foodSearchResults").replaceChildren();

    try {
      const products = await fetchFoodProducts(query);

      if(requestId!==foodSearchCounter) return;

      const foods = sortFoods(
        products.map(normalizeFood).filter(Boolean),
        query
      ).slice(0,15);

      renderFoodResults(foods);

    } catch(error) {
      if(requestId===foodSearchCounter) {
        const reason =
          error.name==="AbortError"
            ? "Die Datenbank hat zu lange nicht geantwortet."
            : String(error.message).startsWith("Bitte")
              ? error.message
              : "Die Lebensmitteldatenbank ist gerade überlastet oder nicht erreichbar.";

        foodMessage(
          reason+
          " Bitte gleich erneut versuchen."+
          " Du kannst Lebensmittel weiterhin manuell eingeben."
        );
      }
    } finally {
      if(requestId===foodSearchCounter) {
        button.disabled = false;
      }
    }
  }
);
