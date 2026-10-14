// Web and native use the same room-scoped protocol. Nothing is persisted to chat.
export const MEETING_TOPIC = 'nexushub.meeting.v1';
export const HAND_ATTRIBUTE = 'nexushub.hand';
export const MEETING_REACTIONS = ['👍', '👏', '❤️', '😂', '🎉'];
type Person = { identity: string; name?: string; attributes?: Record<string, string> };
export type MeetingMessage = { id: string; sender: string; name: string; text: string; at: number };
export type MeetingReaction = { id: string; sender: string; name: string; emoji: string };
export type MeetingInteractionState = { messages: MeetingMessage[]; reactions: MeetingReaction[]; hands: Array<{identity: string; name: string}>; raised: boolean; connected: boolean; messageCount: number };
// A narrow structural adapter avoids tying web/native to one SDK build.
export type MeetingTransport = {
  state: string;
  localParticipant: Person & { publishData: (data: Uint8Array, options: {reliable: boolean; topic: string}) => Promise<void>; setAttributes: (attributes: Record<string,string>) => Promise<void> };
  remoteParticipants: Map<string, Person>;
  on: (event: string, listener: (...args: any[]) => void) => unknown;
  off: (event: string, listener: (...args: any[]) => void) => unknown;
};
export class MeetingInteractionSession {
  private active = false;
  private listeners = new Set<(state: MeetingInteractionState) => void>();
  private seen = new Set<string>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private lastReaction = 0;
  private sending = false;
  private updatingHand = false;
  private state: MeetingInteractionState = { messages: [], reactions: [], hands: [], raised: false, connected: false, messageCount: 0 };
  constructor(private room: MeetingTransport) {}
  snapshot() { return this.state; }
  subscribe(listener: (state: MeetingInteractionState) => void) { this.listeners.add(listener); listener(this.state); return () => {this.listeners.delete(listener);}; }
  private emit() { if (this.active) this.listeners.forEach(listener => listener(this.state)); }
  private sync = () => {
    if (!this.active) return;
    const people = [this.room.localParticipant, ...this.room.remoteParticipants.values()];
    this.state = { ...this.state, connected: this.room.state === 'connected', raised: this.room.localParticipant.attributes?.[HAND_ATTRIBUTE] === 'true', hands: people.filter(person => person.attributes?.[HAND_ATTRIBUTE] === 'true').map(person => ({identity:person.identity,name:person.name || 'Participant'})) };
    this.emit();
  };
  private receive = (data: Uint8Array, participant?: Person, _kind?: unknown, topic?: string) => {
    if (!this.active || topic !== MEETING_TOPIC || !participant || !this.room.remoteParticipants.has(participant.identity) || data.byteLength > 5000) return;
    try { this.accept(JSON.parse(new TextDecoder().decode(data)), participant); } catch { /* Ignore malformed or unrelated packets. */ }
  };
  private accept(packet: any, person: Person) {
    if (!this.active || packet?.v !== 1 || typeof packet.id !== 'string' || !packet.id || packet.id.length > 100 || !['chat','reaction'].includes(packet.type)) return;
    const key = `${person.identity}:${packet.id}`;
    if (this.seen.has(key)) return;
    if (packet.type === 'chat' && (typeof packet.text !== 'string' || !packet.text.trim() || packet.text.length > 1000)) return;
    if (packet.type === 'reaction' && !MEETING_REACTIONS.includes(packet.text)) return;
    this.seen.add(key);
    if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value!);
    if (packet.type === 'chat') {
      this.state = {...this.state, messageCount:this.state.messageCount+1, messages:[...this.state.messages,{id:key,sender:person.identity,name:person.name || 'Participant',text:packet.text,at:Date.now()}].slice(-200)};
    } else {
      this.state = {...this.state,reactions:[...this.state.reactions,{id:key,sender:person.identity,name:person.name || 'Participant',emoji:packet.text}].slice(-8)};
      if (this.timers.size >= 8) { const oldest=this.timers.values().next().value!; clearTimeout(oldest); this.timers.delete(oldest); }
      const timer = setTimeout(() => { this.timers.delete(timer); this.state={...this.state,reactions:this.state.reactions.filter(reaction => reaction.id !== key)}; this.emit(); }, 5000);
      this.timers.add(timer);
    }
    this.emit();
  }
  start() {
    this.active = true;
    this.room.on('dataReceived', this.receive);
    ['participantAttributesChanged','participantConnected','participantDisconnected','connectionStateChanged','reconnected'].forEach(event => this.room.on(event, this.sync));
    this.sync();
  }
  dispose() {
    this.active = false;
    this.room.off('dataReceived', this.receive);
    ['participantAttributesChanged','participantConnected','participantDisconnected','connectionStateChanged','reconnected'].forEach(event => this.room.off(event, this.sync));
    this.timers.forEach(clearTimeout); this.timers.clear(); this.listeners.clear();
    this.seen.clear(); this.state = {messages:[],reactions:[],hands:[],raised:false,connected:false,messageCount:0};
  }
  private ensureConnected() { if (!this.active || this.room.state !== 'connected') throw new Error('Reconnect to the meeting before sending.'); }
  async sendChat(text: string) {
    this.ensureConnected();
    const value = text.trim();
    if (!value || value.length > 1000) throw new Error('Use 1–1,000 characters.');
    if (this.sending) throw new Error('Your message is still sending.');
    this.sending = true;
    try { await this.publish('chat',value); } finally {this.sending = false;}
  }
  async react(emoji: string) {
    this.ensureConnected();
    if (!MEETING_REACTIONS.includes(emoji)) throw new Error('Choose a supported reaction.');
    if (Date.now() - this.lastReaction < 1000) throw new Error('Wait a moment before reacting again.');
    this.lastReaction = Date.now();
    await this.publish('reaction',emoji);
  }
  private async publish(type: string, text: string) {
    const packet = {v:1,type,text,id:`${Date.now()}-${Math.random().toString(36).slice(2)}`};
    await this.room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(packet)), {reliable:true,topic:MEETING_TOPIC});
    this.accept(packet,this.room.localParticipant);
  }
  async toggleHand() {
    this.ensureConnected();
    if (this.updatingHand) return;
    this.updatingHand = true;
    try { await this.room.localParticipant.setAttributes({[HAND_ATTRIBUTE]:this.state.raised ? '' : 'true'}); this.sync(); }
    finally {this.updatingHand=false;}
  }
}
