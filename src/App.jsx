import { useState } from "react";
import MiniSynthApp from "./MiniSynthApp";
import "./App.css";

// FIX #1: Gate isolated in its own component so no hooks are called after a
//         conditional return — Rules of Hooks are no longer violated.
export default function App() {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem("minisynth_unlocked") === "1"
  );
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);

  const handleUnlock = (e) => {
    e.preventDefault();
    if (pwInput === import.meta.env.VITE_APP_PASSWORD) {
      sessionStorage.setItem("minisynth_unlocked", "1");
      setUnlocked(true);
    } else {
      setPwError(true);
      setPwInput("");
    }
  };

  if (!unlocked) {
    return (
      <div className="gate">
        <div className="gate-box">
          <h1 className="gate-title">SammysMiniSynth</h1>
          <p className="gate-subtitle">Polyphonic Synthesizer</p>
          <form className="gate-form" onSubmit={handleUnlock}>
            <input
              className={`gate-input${pwError ? " gate-input--error" : ""}`}
              type="password"
              placeholder="Password"
              value={pwInput}
              autoFocus
              onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
            />
            <button className="gate-btn" type="submit">Enter</button>
          </form>
          {pwError && <p className="gate-error">Incorrect password.</p>}
        </div>
      </div>
    );
  }

  return <MiniSynthApp />;
}
