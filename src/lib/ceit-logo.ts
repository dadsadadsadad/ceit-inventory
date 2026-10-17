// ceit department shield, redrawn as vector so it stays sharp at any size
export const ceitLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 360">
<defs><clipPath id="s"><path d="M4 4h192v308l-96 44-96-44z"/></clipPath></defs>
<path d="M0 0h200v314l-100 46L0 314z" fill="#2b2b2b"/>
<g clip-path="url(#s)">
<rect x="0" y="0" width="200" height="112" fill="#0b0b0b"/>
<rect x="0" y="112" width="200" height="102" fill="#f2a12e"/>
<rect x="0" y="214" width="200" height="150" fill="#ec6a2c"/>
<path d="M0 112h200M0 214h200" stroke="#2b2b2b" stroke-width="3"/>
</g>
<g fill="#fff">
<rect x="95" y="22" width="10" height="76"/>
<rect x="66" y="45" width="68" height="10"/>
<path d="M100 10l7 9-7 7-7-7z"/>
<circle cx="91" cy="22" r="4.5"/><circle cx="109" cy="22" r="4.5"/>
<path d="M100 104l7-9-7-6-7 6z"/>
<path d="M54 50l9-7 7 7-7 7z"/>
<circle cx="66" cy="41" r="4.5"/><circle cx="66" cy="59" r="4.5"/>
<path d="M146 50l-9-7-7 7 7 7z"/>
<circle cx="134" cy="41" r="4.5"/><circle cx="134" cy="59" r="4.5"/>
<path d="M100 42l8 8-8 8-8-8z" fill="#0b0b0b"/>
<path d="M100 45l5 5-5 5-5-5z"/>
</g>
<g transform="translate(88 163)">
<g fill="#fff">
<circle r="27"/>
<g id="t"><rect x="-5.5" y="-35" width="11" height="12" rx="1.5"/></g>
<use href="#t" transform="rotate(40)"/><use href="#t" transform="rotate(80)"/>
<use href="#t" transform="rotate(120)"/><use href="#t" transform="rotate(160)"/>
<use href="#t" transform="rotate(200)"/><use href="#t" transform="rotate(240)"/>
<use href="#t" transform="rotate(280)"/><use href="#t" transform="rotate(320)"/>
</g>
<circle r="19" fill="#f2a12e"/>
</g>
<g transform="translate(112 163)" fill="none" stroke-width="4">
<g stroke="#f2a12e" stroke-width="9">
<ellipse rx="32" ry="11"/>
<ellipse rx="32" ry="11" transform="rotate(60)"/>
<ellipse rx="32" ry="11" transform="rotate(120)"/>
</g>
<g stroke="#fff">
<ellipse rx="32" ry="11"/>
<ellipse rx="32" ry="11" transform="rotate(60)"/>
<ellipse rx="32" ry="11" transform="rotate(120)"/>
</g>
<circle r="6" fill="#fff"/>
</g>
<g fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
<path d="M90 236a24 24 0 0 0-0.1 43.8L91 289M110 236a24 24 0 0 1 0.1 43.8L109 289"/>
<path d="M100 226v42"/>
<path d="M89 294h22M89 303h22M91 312h18"/>
<path d="M95 321h10"/>
</g>
</svg>`;

export const ceitLogoDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ceitLogoSvg)}`;
