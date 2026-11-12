// What the wide layout's detail pane is showing: one of Your clubs, or a competition's table.
export type Selection = { kind: 'club'; id: number } | { kind: 'competition'; code: string };

export const selectionKey = (selection: Selection) =>
  selection.kind === 'club' ? `club:${selection.id}` : `competition:${selection.code}`;
