import "server-only";
import QRCode from "qrcode";
import sharp from "sharp";
import { ceitLogoSvg } from "./ceit-logo";

// high error correction leaves room for the logo in the middle
export async function qrWithLogo(text: string, width: number) {
  const code = await QRCode.toBuffer(text, { errorCorrectionLevel: "H", margin: 1, width });
  const size = (await sharp(code).metadata()).width ?? width;
  const logoHeight = Math.round(size * 0.34);
  const logo = await sharp(Buffer.from(ceitLogoSvg), { density: 300 })
    .resize({ height: logoHeight })
    .png()
    .toBuffer();
  const logoWidth = (await sharp(logo).metadata()).width ?? logoHeight;
  const pad = Math.max(2, Math.round(size * 0.015));
  const boxWidth = logoWidth + pad * 2;
  const boxHeight = logoHeight + pad * 2;
  const box = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${boxWidth}" height="${boxHeight}"><rect width="100%" height="100%" rx="${pad * 2}" fill="#fff"/></svg>`,
  );
  const left = Math.round((size - boxWidth) / 2);
  const top = Math.round((size - boxHeight) / 2);
  const png = await sharp(code)
    .composite([
      { input: box, left, top },
      { input: logo, left: left + pad, top: top + pad },
    ])
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
