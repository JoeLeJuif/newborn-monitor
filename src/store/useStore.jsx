// Store applicatif : événements + profil bébé, persistés dans localStorage.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  loadEvents,
  saveEvents,
  loadBaby,
  saveBaby,
  newId,
  getDeviceId,
} from '../lib/storage.js';
import { nowISO } from '../lib/time.js';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [events, setEvents] = useState(() => loadEvents());
  const [baby, setBaby] = useState(() => loadBaby());
  const deviceId = useRef(getDeviceId());
  const first = useRef(true);

  useEffect(() => {
    saveEvents(events);
  }, [events]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    saveBaby(baby);
  }, [baby]);

  function addEvent(data) {
    const ev = {
      id: newId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      deviceId: deviceId.current,
      ...data,
    };
    setEvents((prev) => [...prev, ev]);
    return ev;
  }

  function updateEvent(id, patch) {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, ...patch, updatedAt: nowISO() } : e,
      ),
    );
  }

  function deleteEvent(id) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  function getEvent(id) {
    return events.find((e) => e.id === id) || null;
  }

  const value = {
    events,
    baby,
    setBaby,
    addEvent,
    updateEvent,
    deleteEvent,
    getEvent,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore doit être utilisé dans StoreProvider');
  return ctx;
}
