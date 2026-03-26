/**
 * In-memory storage for notes (demo purposes)
 */

import { Note } from "./types.js";

class NoteStorage {
  private notes: Map<string, Note> = new Map();
  private counter = 1;

  create(title: string, content: string, tags: string[]): Note {
    const id = `note_${this.counter++}`;
    const now = new Date().toISOString();
    const note: Note = {
      id,
      title,
      content,
      tags,
      createdAt: now,
      updatedAt: now
    };
    this.notes.set(id, note);
    return note;
  }

  get(id: string): Note | undefined {
    return this.notes.get(id);
  }

  update(id: string, updates: Partial<Pick<Note, "title" | "content" | "tags">>): Note | undefined {
    const note = this.notes.get(id);
    if (!note) return undefined;

    const updated: Note = {
      ...note,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.notes.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.notes.delete(id);
  }

  list(limit: number, offset: number): { notes: Note[]; total: number } {
    const allNotes = Array.from(this.notes.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      notes: allNotes.slice(offset, offset + limit),
      total: allNotes.length
    };
  }

  search(query: string, limit: number, offset: number): { notes: Note[]; total: number } {
    const lowerQuery = query.toLowerCase();
    const matched = Array.from(this.notes.values())
      .filter(note =>
        note.title.toLowerCase().includes(lowerQuery) ||
        note.content.toLowerCase().includes(lowerQuery) ||
        note.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return {
      notes: matched.slice(offset, offset + limit),
      total: matched.length
    };
  }
}

// Singleton instance
export const storage = new NoteStorage();

// Initialize with some demo data
storage.create(
  "Welcome to Notes MCP",
  "This is a demo MCP server for note management. You can create, read, update, delete, and search notes.",
  ["demo", "welcome"]
);

storage.create(
  "Meeting Notes - Project Review",
  "Discussed Q1 progress. Key decisions: launch date set for March 15, budget approved with 10% increase.",
  ["meeting", "project", "important"]
);

storage.create(
  "Shopping List",
  "- Milk\n- Bread\n- Eggs\n- Coffee\n- Vegetables",
  ["shopping", "personal"]
);
