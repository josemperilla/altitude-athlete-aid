import type { GymSession } from "@/lib/api";
import { GymExercise } from "./GymExercise";

export function GymSessionCard({ session }: { session: GymSession }) {
  return (
    <section className="club-card gym-session" data-code={session.code}>
      <div className="gym-session-head">
        <div className="sid">
          <span className="code">{session.label || `Sesión ${session.code}`}</span>
          <span className="meta mono">
            {session.weekday} · ~{session.duration_min} min
          </span>
        </div>
        <h3>{session.title}</h3>
        <p className="summary">{session.summary}</p>
      </div>

      {session.blocks.map((block) => (
        <div key={block.name}>
          <div className="gym-block-head">
            <span>{block.name}</span>
            <span className="mins mono">{block.minutes} min</span>
          </div>
          {block.note && <div className="gym-block-note">{block.note}</div>}
          {block.items.map((item, i) => (
            <GymExercise key={`${block.name}-${item.name}-${i}`} item={item} />
          ))}
        </div>
      ))}
    </section>
  );
}
