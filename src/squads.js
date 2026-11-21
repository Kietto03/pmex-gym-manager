// The squads of each type: the core squad (members whose main type it is) and the reinforcement squad (members who back that type up
// when the core struggles). `rows` are the Roles rows: { type, reinType, total }; `order` is the game's type order. A stage type is flagged when one side is empty.
export function squadsOf(rows, stageTypes = [], order) {
  const types = new Set([...stageTypes, ...rows.flatMap(r => [r.type, r.reinType]).filter(Boolean)]);
  const best = (a, b) => b.total - a.total;
  return order.filter(ty => types.has(ty)).map(ty => ({
    type: ty, stage: stageTypes.includes(ty),
    core: rows.filter(r => r.type === ty).sort(best),
    reinforcement: rows.filter(r => r.reinType === ty).sort(best),
  }));
}
// A run is "main" on the member's main type, "reinforce" on the reinforcement type, otherwise "support" (to review)
export const runKind = (stageType, mainAt, reinAt) => (!mainAt || !stageType ? 'unclassified' : mainAt === stageType ? 'main' : reinAt === stageType ? 'reinforce' : 'support');
