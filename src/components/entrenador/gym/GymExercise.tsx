import { useState } from "react";
import type { GymExercise as GymExerciseType } from "@/lib/api";
import { WEIGHT_GUIDE } from "@/lib/gym/loads.js";
import { PHOTOS, PHOTO_CAVEATS } from "@/lib/gym/photos.js";
import { GymFigure } from "./GymFigure";

type Guide = {
  inicio: string;
  arranque: string;
  progresion: string;
  techo: string;
  aviso: string;
};

function guideFor(anim: string | null): Guide | null {
  if (!anim) return null;
  return ((WEIGHT_GUIDE as Record<string, Guide>)[anim] as Guide) ?? null;
}

/** Las dos líneas de carga que se ven sin desplegar nada: con qué arrancar y cómo subir. */
function LoadCompact({ guide }: { guide: Guide }) {
  return (
    <dl className="gym-load">
      <dt>Cuánto cargar</dt>
      <dd>
        <b>{guide.arranque}</b> {guide.inicio}
      </dd>
      <dt>Progresión</dt>
      <dd>{guide.progresion}</dd>
    </dl>
  );
}

/** La guía entera, con techo y qué hacer si falla. Solo dentro del desplegable. */
function LoadFull({ guide }: { guide: Guide }) {
  const fields: [string, string][] = [
    ["Arranque", guide.arranque],
    ["Regla", guide.inicio],
    ["Progresión", guide.progresion],
    ["Techo", guide.techo],
    ["Si falla", guide.aviso],
  ];
  return (
    <div className="gym-load-full">
      <h4>Guía de carga</h4>
      <dl>
        {fields.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function GymExercise({ item }: { item: GymExerciseType }) {
  const [open, setOpen] = useState(false);
  const guide = guideFor(item.anim);
  const photo = item.anim ? (PHOTOS as Record<string, string>)[item.anim] : undefined;
  const caveat = item.anim ? (PHOTO_CAVEATS as Record<string, string>)[item.anim] : undefined;

  // Los calentamientos genéricos ("Bici o remo suave") no traen id ni detalle:
  // se ven como una línea y ya, sin desplegable que abrir en vano.
  const hasMore =
    Boolean(item.id) && (item.cues?.length || item.errors?.length || item.alt || guide);

  return (
    <article className="gym-ex">
      <div className="gym-ex-row">
        <div className="gym-ex-id">
          <div className="nm">{item.name}</div>
          {item.target && <p className="tgt">{item.target}</p>}
        </div>
        <div className="gym-ex-r">
          <span className="pres mono">{item.prescription}</span>
          {item.load && <span className="loadc mono">{item.load}</span>}
        </div>
      </div>

      {/* La animación va siempre visible. Estuvo detrás de un botón y el
          resultado era una lista sin una sola animación a la vista: nadie pulsa
          para ver algo que no sabe que está ahí. */}
      <GymFigure anim={item.anim} name={item.name} />

      {guide && <LoadCompact guide={guide} />}

      {hasMore && (
        <>
          <button
            type="button"
            className="gym-more"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Ocultar ▴" : "Técnica · carga · fotos ▾"}
          </button>

          {open && (
            <div className="gym-ex-body">
              {item.cues?.length > 0 && (
                <>
                  <h4>Cómo hacerlo bien</h4>
                  <ul>
                    {item.cues.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </>
              )}
              {item.errors?.length > 0 && (
                <>
                  <h4 className="bad">Errores que se cometen</h4>
                  <ul className="bad">
                    {item.errors.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </>
              )}
              {item.alt && <div className="gym-alt">{item.alt}</div>}
              {guide && <LoadFull guide={guide} />}

              {photo && item.anim && (
                <>
                  <h4>Referencia en foto</h4>
                  <div className="gym-refpair">
                    <figure>
                      <img
                        src={`/ex/${item.anim}-0.jpg`}
                        alt={`${item.name}, inicio`}
                        loading="lazy"
                      />
                      <figcaption>Inicio</figcaption>
                    </figure>
                    <figure>
                      <img
                        src={`/ex/${item.anim}-1.jpg`}
                        alt={`${item.name}, final`}
                        loading="lazy"
                      />
                      <figcaption>Final</figcaption>
                    </figure>
                  </div>
                  {caveat && <p className="gym-caveat">{caveat}</p>}
                </>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}
