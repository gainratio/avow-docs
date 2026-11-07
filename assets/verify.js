export const SAMPLE = {
  payload: {
    approved_by: "dana",
    release: "checkout-api 2.4.1",
    tests_passed: true,
  },
  payload_hash: "sha256:64a2594744910b829fe6f712750b05f87e08313a5f98af6ce2d170116d2a3fc5",
  public_key: "47c7e14708f5e1acf35e998cc289997a19299ffef8fa86953fe99278c4ec6dd5",
  schema: "avow.receipt/v1",
  signature: "20e8b0a7310cbc640046ace3fedda22592fdb525d7bbf254036d61a184f6c9d7e6224187def7618791b9d5b0f39659ec8e8fe87e807307626b561d21150b4200",
};

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fromHex(value) {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function digest(payload) {
  const bytes = new TextEncoder().encode(canonical(payload));
  return `sha256:${toHex(await crypto.subtle.digest("SHA-256", bytes))}`;
}

export async function verify(payload) {
  const fingerprint = await digest(payload);
  if (fingerprint !== SAMPLE.payload_hash) {
    return { ok: false, reason: `payload hash mismatch\nreceipt says  ${SAMPLE.payload_hash}\ncomputed      ${fingerprint}` };
  }
  try {
    const key = await crypto.subtle.importKey("raw", fromHex(SAMPLE.public_key), { name: "Ed25519" }, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      fromHex(SAMPLE.signature),
      new TextEncoder().encode(canonical(payload)),
    );
    return valid
      ? { ok: true, reason: `avow.verify.ok\nfingerprint  ${fingerprint}\nsigner       ${SAMPLE.public_key.slice(0, 16)}…` }
      : { ok: false, reason: "signature does not match the public key" };
  } catch (error) {
    return { ok: false, reason: `webcrypto: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function tamperPayloadText(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...parsed, approved_by: "mallory" };
    }
  } catch {
    // Fall back to a tampered copy of the sample payload when textarea JSON was invalid.
  }
  return { ...SAMPLE.payload, approved_by: "mallory" };
}

if (typeof document !== "undefined") {
  const input = document.querySelector("#receipt-payload");
  const result = document.querySelector("#demo-result");
  const verifyButton = document.querySelector("#verify");
  const tamperButton = document.querySelector("#tamper");
  const resetButton = document.querySelector("#reset");

  function setResult(kind, message) {
    result.className = `demo-result ${kind}`;
    result.textContent = message;
  }

  async function run(payload) {
    if (!globalThis.crypto?.subtle) {
      setResult("bad", "This browser does not expose WebCrypto.");
      return;
    }
    setResult("idle", "Verifying…");
    const outcome = await verify(payload);
    setResult(outcome.ok ? "ok" : "bad", outcome.reason);
  }

  function payloadFromInput() {
    try {
      return JSON.parse(input.value);
    } catch (error) {
      setResult("bad", `Not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  input.value = JSON.stringify(SAMPLE.payload, null, 2);
  verifyButton.addEventListener("click", () => {
    const payload = payloadFromInput();
    if (payload !== undefined) void run(payload);
  });
  tamperButton.addEventListener("click", () => {
    const payload = tamperPayloadText(input.value);
    input.value = JSON.stringify(payload, null, 2);
    void run(payload);
  });
  resetButton.addEventListener("click", () => {
    input.value = JSON.stringify(SAMPLE.payload, null, 2);
    setResult("idle", "Receipt restored. Verify it again.");
  });
}
