// Original line study of the equipment this workspace looks after.
// Decorative and server-rendered: no image request, client code, or fake live data.
export function EquipmentStudy({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`equipment-study ${className}`}
      viewBox="0 0 400 248"
      fill="none"
      aria-hidden="true"
    >
      <path className="study-ground" d="M20 224H380M42 232H112M318 232H358" />
      <g className="study-monitor">
        <path
          className="study-fill"
          d="M51 35H260A10 10 0 0 1 270 45V163H41V45A10 10 0 0 1 51 35Z"
        />
        <path className="study-screen" d="M51 46H260V151H51Z" />
        <path className="study-fill" d="M41 163H270V173A7 7 0 0 1 263 180H48A7 7 0 0 1 41 173Z" />
        <path className="study-fill" d="M142 180H170L174 211H138L142 180Z" />
        <path className="study-fill" d="M121 211H191L201 220H111L121 211Z" />
        <path className="study-line" d="M61 58H73M61 58V70M249 139H237M249 139V127" />
        <path
          className="study-accent"
          d="M87 79H118V87H95V113H118V121H87V79ZM128 79H159V87H136V95H155V103H136V113H159V121H128V79ZM169 79H177V121H169V79ZM187 79H223V87H209V121H201V87H187V79Z"
        />
        <circle cx="156" cy="171" r="2" className="study-accent" />
      </g>
      <g className="study-projector">
        <path
          className="study-fill"
          d="M239 148L262 127H351L377 148V204A8 8 0 0 1 369 212H247A8 8 0 0 1 239 204V148Z"
        />
        <path
          className="study-line"
          d="M239 148H377M254 138H276M286 138H305M255 161H281M255 169H281M255 177H281"
        />
        <circle cx="338" cy="178" r="23" className="study-lens" />
        <circle cx="338" cy="178" r="16" className="study-line" />
        <path className="study-line" d="M330 170L346 186M330 186L346 170M253 212V221M361 212V221" />
        <rect x="255" y="190" width="29" height="8" rx="1" className="study-accent" />
      </g>
      <g className="study-tag">
        <path className="study-line" d="M52 170C20 177 26 210 58 202" />
        <path className="study-fill" d="M59 187L101 179L109 213L67 222L56 208L59 187Z" />
        <circle cx="66" cy="202" r="2" className="study-line" />
        <path className="study-line" d="M77 192L81 211M82 191L86 210M89 190L93 209M94 189L98 208" />
      </g>
    </svg>
  );
}
