import { describe, expect, it } from "vitest";
import { hexToHsl, nameColor, readPalette, type PaletteGarment } from "@/lib/palette";

const garment = (label: string, area: number, ...colors: [string, number][]): PaletteGarment => ({
  label,
  area,
  colors: colors.map(([hex, share]) => ({ hex, share })),
});

describe("color names", () => {
  it("converts hex to HSL", () => {
    expect(hexToHsl("#ff0000")).toEqual({ h: 0, s: 1, l: 0.5 });
    expect(hexToHsl("#808080").s).toBe(0);
  });

  it("names clothing colors the way people say them", () => {
    const cases: Record<string, string> = {
      "#121212": "black",
      "#f7f7f5": "white",
      "#3a3a3c": "charcoal",
      "#8c8c8c": "grey",
      "#c2a47c": "camel",
      "#5a3a1e": "brown",
      "#e6d9bf": "beige",
      "#1f2a44": "navy",
      "#4a6a8c": "denim blue",
      "#6b1520": "burgundy",
      "#556b2f": "olive",
      "#d32f2f": "red",
      "#f48b03": "orange",
      "#f2d20a": "yellow",
      "#2e9e4f": "green",
      "#1565c0": "blue",
      "#7901c8": "purple",
      "#ff8fc0": "pink",
    };
    for (const [hex, name] of Object.entries(cases)) expect([hex, nameColor(hex)]).toEqual([hex, name]);
  });
});

describe("palette read", () => {
  it("returns null without measured colors", () => {
    expect(readPalette([])).toBeNull();
    expect(readPalette([garment("Pants", 0.1)])).toBeNull();
  });

  it("recognizes an all-neutral fit", () => {
    const r = readPalette([garment("Upper-clothes", 0.2, ["#121212", 1]), garment("Pants", 0.15, ["#c2a47c", 1])]);
    expect(r).toMatchObject({ scheme: "neutral" });
    expect(r?.summary).toContain("black, camel");
  });

  it("recognizes a neutral base with one accent", () => {
    const r = readPalette([garment("Upper-clothes", 0.2, ["#d32f2f", 1]), garment("Pants", 0.15, ["#1f2a44", 1]), garment("Shoes", 0.03, ["#f7f7f5", 1])]);
    expect(r).toMatchObject({ scheme: "accent" });
    expect(r?.summary).toBe("neutral base (navy, white) with one accent (red): intentional");
  });

  it("ignores specks below the accent threshold", () => {
    // A 1% red logo on a black fit is still an all-neutral palette.
    const r = readPalette([garment("Upper-clothes", 0.3, ["#121212", 0.97], ["#d32f2f", 0.03]), garment("Pants", 0.2, ["#121212", 1])]);
    expect(r?.scheme).toBe("neutral");
  });

  it("recognizes tonal, complementary and clashing palettes", () => {
    expect(readPalette([garment("Upper-clothes", 0.2, ["#2e9e4f", 1]), garment("Pants", 0.15, ["#1e8f8a", 1])])?.scheme).toBe("analogous");
    expect(readPalette([garment("Upper-clothes", 0.2, ["#1565c0", 1]), garment("Pants", 0.15, ["#f48b03", 1])])?.scheme).toBe("complementary");
    // The drawing kiosk tests used: orange, purple, yellow, green, magenta all at once.
    const clash = readPalette([
      garment("Upper-clothes", 0.1, ["#f48b03", 0.62], ["#d124f0", 0.32]),
      garment("Pants", 0.07, ["#7901c8", 0.78], ["#b19a01", 0.2]),
      garment("Hat", 0.01, ["#01ff01", 0.56]),
    ]);
    expect(clash?.scheme).toBe("clashing");
    expect(clash?.summary).toMatch(/competing colors .* clashing/);
  });
});
