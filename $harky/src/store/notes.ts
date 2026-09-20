import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { newId } from '@/data/seed'
import { CAT_COLORS } from '@/constants'
import { defaultIconFor, type Note, type NoteItem, type NoteType } from '@/data/notes'

/** Datos mínimos para crear una lista; el resto se rellena con defaults. */
export interface NewNote {
  title?: string
  type: NoteType
  color?: string
  categoryId?: string
  accountId?: string
  goalId?: string
}

interface NotesState {
  notes: Note[]
  addNote: (input: NewNote) => string
  updateNote: (id: string, patch: Partial<Omit<Note, 'id' | 'createdAt'>>) => void
  deleteNote: (id: string) => void
  /** Reinserta una lista borrada tal cual (mismo id, mismos ítems) — «Deshacer». */
  restoreNote: (note: Note) => void
  addItem: (noteId: string, item: Pick<NoteItem, 'text'> & Partial<NoteItem>) => void
  updateItem: (noteId: string, itemId: string, patch: Partial<Omit<NoteItem, 'id'>>) => void
  toggleItem: (noteId: string, itemId: string) => void
  removeItem: (noteId: string, itemId: string) => void
  /** Duplica una lista (plantilla): copia título + ítems, desmarcando todo. */
  duplicateNote: (id: string) => string | null
  /** Reemplaza todas las listas — usado al restaurar un backup. */
  importNotes: (notes: Note[]) => void
}

const now = () => Date.now()

export const useNotes = create<NotesState>()(
  persist(
    (set) => ({
      notes: [],

      addNote: (input) => {
        const id = newId('note_')
        const note: Note = {
          id,
          title: input.title?.trim() ?? '',
          type: input.type,
          body: input.type === 'note' ? '' : undefined,
          items: [],
          color: input.color ?? (CAT_COLORS as readonly string[])[0],
          icon: defaultIconFor(input.type),
          categoryId: input.categoryId,
          accountId: input.accountId,
          goalId: input.goalId,
          createdAt: now(),
          updatedAt: now(),
        }
        set(s => ({ notes: [note, ...s.notes] }))
        return id
      },

      updateNote: (id, patch) => set(s => ({
        notes: s.notes.map(n => n.id === id ? { ...n, ...patch, updatedAt: now() } : n),
      })),

      deleteNote: (id) => set(s => ({ notes: s.notes.filter(n => n.id !== id) })),

      // Reinserta al principio (como una lista recién creada) preservando id e
      // ítems. Se ignora si ya existe, por si se toca «Deshacer» dos veces.
      restoreNote: (note) => set(s =>
        s.notes.some(n => n.id === note.id) ? s : { notes: [note, ...s.notes] }),

      addItem: (noteId, item) => set(s => ({
        notes: s.notes.map(n => n.id === noteId
          ? { ...n, updatedAt: now(), items: [...n.items, {
              id: newId('nit_'),
              text: item.text.trim(),
              done: item.done ?? false,
              ...(item.price != null ? { price: item.price } : {}),
              ...(item.qty != null ? { qty: item.qty } : {}),
            }] }
          : n),
      })),

      updateItem: (noteId, itemId, patch) => set(s => ({
        notes: s.notes.map(n => n.id === noteId
          ? { ...n, updatedAt: now(), items: n.items.map(it => it.id === itemId ? { ...it, ...patch } : it) }
          : n),
      })),

      toggleItem: (noteId, itemId) => set(s => ({
        notes: s.notes.map(n => n.id === noteId
          ? { ...n, updatedAt: now(), items: n.items.map(it => it.id === itemId ? { ...it, done: !it.done } : it) }
          : n),
      })),

      removeItem: (noteId, itemId) => set(s => ({
        notes: s.notes.map(n => n.id === noteId
          ? { ...n, updatedAt: now(), items: n.items.filter(it => it.id !== itemId) }
          : n),
      })),

      duplicateNote: (id) => {
        const src = useNotes.getState().notes.find(n => n.id === id)
        if (!src) return null
        const copyId = newId('note_')
        const copy: Note = {
          ...src,
          id: copyId,
          title: `${src.title} (copia)`.trim(),
          items: src.items.map(it => ({ ...it, id: newId('nit_'), done: false })),
          createdAt: now(),
          updatedAt: now(),
        }
        set(s => ({ notes: [copy, ...s.notes] }))
        return copyId
      },

      importNotes: (notes) => set({ notes }),
    }),
    {
      name: 'sharky-notes-v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
