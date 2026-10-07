"use client";

import { useRef, useState } from "react";
import { useTx } from "./Copy";

const designs = {
  rock: {
    src: "/design/rock.jpg",
    position: "50% 50%",
    label: "SKIN / 01",
    altEn: "Dark rock artwork on the card",
    altAr: "تصميم الصخور الداكنة على البطاقة",
    nameEn: "Rocks",
    nameAr: "صخور",
  },
  portrait: {
    src: "/design/portrait.jpg",
    position: "50% 30%",
    label: "SKIN / 02",
    altEn: "Black and white portrait artwork on the card",
    altAr: "تصميم البورتريه بالأبيض والأسود على البطاقة",
    nameEn: "Portrait",
    nameAr: "بورتريه",
  },
  saudi: {
    src: "/design/saudi.jpg",
    position: "50% 50%",
    label: "SKIN / 03",
    altEn: "Burgundy artwork with the national emblem on the card",
    altAr: "تصميم عنّابي بشعار المملكة على البطاقة",
    nameEn: "Burgundy",
    nameAr: "عنّابي",
  },
} as const;

type DesignId = keyof typeof designs;

export function SkinStudio() {
  const tx = useTx();
  const artRef = useRef<HTMLImageElement>(null);
  const [active, setActive] = useState<DesignId>("rock");
  const design = designs[active];

  function choose(next: DesignId, button: HTMLButtonElement) {
    setActive(next);
    const art = artRef.current;
    const chosen = designs[next];
    if (art) {
      art.style.objectPosition = chosen.position;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduced && art.animate) {
        art.getAnimations().forEach((item) => item.cancel());
        art.animate(
          [
            { opacity: 0.25, transform: "scale(1.045)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          { duration: 480, easing: "cubic-bezier(.22,1,.36,1)" },
        );
      }
    }
    button.parentElement?.querySelectorAll("[data-design]").forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });
  }

  return (
    <div className="studio" id="designs">
      <div className="studiohead">
        <span>{tx("Choose your card look", "اختر مظهر بطاقتك")}</span>
        <span dir="ltr">NAMAT / SKINS</span>
      </div>
      <div className="wallet">
        <div className="wallethead">
          <span>Wallet</span>
          <span className="plus" aria-hidden="true">
            +
          </span>
        </div>
        <div className="card" id="card">
          <img
            ref={artRef}
            className="card-art"
            id="card-art"
            src={design.src}
            alt={tx(design.altEn, design.altAr)}
            style={{ objectPosition: design.position }}
          />
          <div className="cardtop">
            <span className="cardtitle">NAMAT</span>
            <span className="cardlabel" id="label">
              {design.label}
            </span>
          </div>
          <div className="cardbottom">
            <span className="cardnum">•••• 0248</span>
            <span className="cardbrand">VISA</span>
          </div>
        </div>
        <div className="walletnote">
          {tx(
            "Illustrative preview — applied on supported cards",
            "معاينة توضيحية — التطبيق على البطاقات المدعومة",
          )}
        </div>
      </div>
      <div className="selector" role="group" aria-label={tx("Choose a card image", "اختر صورة البطاقة")}>
        {(Object.keys(designs) as DesignId[]).map((id) => (
          <button
            key={id}
            type="button"
            className="swatch"
            data-design={id}
            aria-pressed={active === id}
            onClick={(event) => choose(id, event.currentTarget)}
          >
            <img src={designs[id].src} alt="" />
            <span>{tx(designs[id].nameEn, designs[id].nameAr)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
