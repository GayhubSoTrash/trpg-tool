async function request(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => null);

    if (!response.ok) throw new Error(data?.error || '操作失敗');
    return data;
}

export const api = {
    getSkillCatalog: profession =>
        request(`/api/skills/catalog?profession=${encodeURIComponent(profession || '')}`),

    setCharacterSkill: (characterId, slotIndex, skillKey, profession, skillSlots) =>
        request(`/api/characters/${characterId}/skills/${slotIndex}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skillKey, profession, skillSlots })
        }),


    getChatMessages: (channel, limit = 100) =>
        request(`/api/chat/messages?channel=${encodeURIComponent(channel)}&limit=${limit}`),

    clearChatMessages: channel =>
        request(`/api/chat/messages?channel=${encodeURIComponent(channel)}`, {
            method: 'DELETE'
        }),

    sendTeamMessage: (characterId, content) => request('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, content })
    }),

    getCombatSkills: actorId => request(`/api/combat/skills?actorId=${encodeURIComponent(actorId || '')}`),

    getCombatState: () => request('/api/combat/state'),

    getBattleLogs: (limit = 250) =>
        request(`/api/combat/logs?limit=${limit}`),

    clearBattleLogs: () => request('/api/combat/logs', {
        method: 'DELETE'
    }),

    useCombatSkill: payload => request('/api/combat/use-skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }),

    getOpenReaction: () => request('/api/combat/reactions/open'),

    respondReaction: (reactionId, payload) =>
        request(`/api/combat/reactions/${reactionId}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }),

    nextTurn: () => request('/api/combat/next-turn', {
        method: 'POST'
    }),

    nextRound: () => request('/api/combat/next-round', {
        method: 'POST'
    }),

    resetCombat: () => request('/api/combat/reset', {
        method: 'POST'
    }),
    getCharacters: () => request('/api/characters'),
    getBuffCatalog: () => request('/api/buffs/catalog'),

    createCharacter: formData => request('/api/characters', {
        method: 'POST',
        body: formData
    }),

    updateCharacter: (characterId, payload) => request(`/api/characters/${characterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }),

    deleteCharacter: characterId => request(`/api/characters/${characterId}`, {
        method: 'DELETE'
    }),

    changeStat: (characterId, statType, delta) => request(`/api/characters/${characterId}/stat`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statType, delta })
    }),

    addBuff: (characterId, buffKey, sourceCharacterId = null) =>
        request(`/api/characters/${characterId}/buffs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ buffKey, sourceCharacterId })
        }),

    removeBuff: (characterId, buffKey) => request(`/api/characters/${characterId}/buffs/${encodeURIComponent(buffKey)}`, {
        method: 'DELETE'
    }),

    getGridGroups: () => request('/api/grid-groups'),

    createGridGroup: payload => request('/api/grid-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }),

    moveGridGroup: (groupId, worldX, worldY) => request(`/api/grid-groups/${groupId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldX, worldY })
    }),

    deleteGridGroup: groupId => request(`/api/grid-groups/${groupId}`, {
        method: 'DELETE'
    }),

    moveCharacter: (characterId, cellId, actionActorId) => request('/api/combat/move-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, cellId, actionActorId })
    }),

    occupyCell: (cellId, characterId) => request(`/api/cells/${cellId}/occupy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId })
    }),

    vacateCharacter: characterId => request(`/api/characters/${characterId}/vacate`, {
        method: 'PATCH'
    })
};
