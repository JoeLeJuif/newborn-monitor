import { NOTES_IN_OCTAVE } from "../audio/keyMap";
import "./PianoKeyboard.css";

// Renders two octaves: current octave + one above
export default function PianoKeyboard({ octave, activeNotes, onNoteOn, onNoteOff }) {
  const octaves = [octave, octave + 1];

  return (
    <div className="piano-wrapper">
      <div className="piano-keyboard">
        {octaves.map((oct) =>
          NOTES_IN_OCTAVE.map(({ note, black }) => {
            const fullNote = `${note}${oct}`;
            const isActive = activeNotes.has(fullNote);
            return (
              <div
                key={fullNote}
                className={`key ${black ? "key--black" : "key--white"} ${isActive ? "key--active" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); onNoteOn(fullNote); }}
                onMouseUp={() => onNoteOff(fullNote)}
                onMouseLeave={() => onNoteOff(fullNote)}
                onTouchStart={(e) => { e.preventDefault(); onNoteOn(fullNote); }}
                onTouchEnd={() => onNoteOff(fullNote)}
              >
                {!black && <span className="key-label">{note}{oct}</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
