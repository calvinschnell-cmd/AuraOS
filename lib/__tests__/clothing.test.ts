import { describe, expect, it } from "vitest";
import { COSTUME_CHANCE, FORMAL_CHANCE, generateOutfit, generateUniqueOutfit, outfitSignature, signatureOverlap } from "@/lib/clothing/generator";
import { THEMES } from "@/lib/clothing/themes";
import {
  ACCESSORY_TYPES,
  BOTTOM_TYPES,
  EYEWEAR_TYPES,
  HEADWEAR_TYPES,
  MASCOT_ANIMALS,
  OUTERWEAR_TYPES,
  PATTERNS,
  SHOE_TYPES,
  SLOTS,
  TOP_TYPES,
} from "@/lib/clothing/types";
import { costumeAnimation } from "@/lib/costumePoses";

const HEX = /^#[0-9a-f]{6}$/;

describe("procedural clothing generator", () => {
  it("is deterministic per seed", () => {
    expect(generateOutfit("abc")).toEqual(generateOutfit("abc"));
    expect(generateOutfit("abc")).not.toEqual(generateOutfit("abd"));
  });

  it("always yields valid garments and colors", () => {
    for (let i = 0; i < 200; i++) {
      const o = generateOutfit(`seed-${i}`);
      expect(TOP_TYPES).toContain(o.top.type);
      expect(OUTERWEAR_TYPES).toContain(o.outerwear.type);
      expect(BOTTOM_TYPES).toContain(o.bottom.type);
      expect(SHOE_TYPES).toContain(o.shoes.type);
      expect(HEADWEAR_TYPES).toContain(o.headwear.type);
      expect(EYEWEAR_TYPES).toContain(o.eyewear.type);
      expect(ACCESSORY_TYPES).toContain(o.accessory.type);
      if (o.formal === "none") {
        expect(o.top.type).not.toBe("gown");
        expect(o.bottom.type).not.toBe("none");
      }
      for (const slot of SLOTS) {
        expect(o[slot].primary).toMatch(HEX);
        expect(o[slot].secondary).toMatch(HEX);
        expect(PATTERNS).toContain(o[slot].pattern);
      }
      expect(o.theme === "chaos" || THEMES.some((t) => t.id === o.theme)).toBe(true);
      if (o.theme !== "chaos") expect(o.wildcards.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("rolls chaos fits roughly 20% of the time", () => {
    let chaos = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) if (generateOutfit(`c-${i}`).theme === "chaos") chaos++;
    expect(chaos / n).toBeGreaterThan(0.12);
    expect(chaos / n).toBeLessThan(0.3);
  });

  it("every theme has 4 to 6 palettes", () => {
    for (const t of THEMES) {
      expect(t.palettes.length).toBeGreaterThanOrEqual(4);
      expect(t.palettes.length).toBeLessThanOrEqual(6);
    }
  });

  it("wears eyewear about half the time", () => {
    let glasses = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) if (generateOutfit(`e-${i}`).eyewear.type !== "none") glasses++;
    expect(glasses / n).toBeGreaterThan(0.38);
    expect(glasses / n).toBeLessThan(0.62);
  });

  it("rolls coordinated formalwear rarely and consistently", () => {
    let formal = 0;
    const n = 6000;
    for (let i = 0; i < n; i++) {
      const o = generateOutfit(`f-${i}`);
      if (o.formal === "none") continue;
      formal++;
      if (o.formal === "suit") {
        expect(o.top.type).toBe("dress_shirt");
        expect(o.outerwear.type).toBe("blazer");
        expect(o.bottom.type).toBe("slacks");
        expect(o.outerwear.primary).toBe(o.bottom.primary);
      } else {
        expect(o.top.type).toBe("gown");
        expect(o.bottom.type).toBe("none");
        expect(o.shoes.type).toBe("heels");
      }
    }
    expect(formal / n).toBeGreaterThan(FORMAL_CHANCE * 0.4);
    expect(formal / n).toBeLessThan(FORMAL_CHANCE * 2.2);
    expect(generateOutfit("force-suit", { formal: "suit" }).formal).toBe("suit");
    expect(generateOutfit("force-gown", { formal: "gown" }).top.type).toBe("gown");
  });

  it("rolls a full costume about 1% of the time", () => {
    let costumes = 0;
    const n = 6000;
    for (let i = 0; i < n; i++) if (generateOutfit(`k-${i}`).costume !== "none") costumes++;
    expect(costumes / n).toBeGreaterThan(COSTUME_CHANCE * 0.4);
    expect(costumes / n).toBeLessThan(COSTUME_CHANCE * 2.2);
  });

  it("can force a costume without changing the rest of the roll", () => {
    const plain = generateOutfit("force-me");
    const forced = generateOutfit("force-me", { costume: "astronaut" });
    expect(forced.costume).toBe("astronaut");
    expect(forced.top).toEqual(plain.top);
    expect(forced.bottom).toEqual(plain.bottom);
    const mascot = generateOutfit("force-me", { costume: "mascot", mascot: "trex" });
    expect(mascot.mascot).toBe("trex");
  });

  it("every mascot and costume has a signature animation", () => {
    for (const animal of MASCOT_ANIMALS) {
      const anim = costumeAnimation("mascot", animal);
      expect(anim?.loop).toBe(true);
      expect(anim?.keyframes.length).toBeGreaterThan(1);
    }
    expect(costumeAnimation("astronaut", null)?.name).toBe("astronautFloat");
    expect(costumeAnimation("diver", null)?.name).toBe("diverWalk");
    expect(costumeAnimation("none", null)).toBeNull();
  });

  it("re-rolls when a signature overlaps recent fits on 4+ slots", () => {
    const first = generateOutfit("dup");
    const sig = outfitSignature(first);
    expect(signatureOverlap(sig, sig)).toBe(SLOTS.length);
    const unique = generateUniqueOutfit("dup", [sig]);
    expect(signatureOverlap(outfitSignature(unique), sig)).toBeLessThan(4);
  });
});
