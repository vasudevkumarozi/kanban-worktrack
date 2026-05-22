import { useState, useRef, useEffect } from 'react';

interface Member { id: string; name: string; avatar?: string }

interface Props {
  value: string;
  onChange: (value: string, mentionedIds: string[]) => void;
  members: Member[];
  placeholder?: string;
  onSubmit?: () => void;
  disabled?: boolean;
}

export default function MentionInput({ value, onChange, members, placeholder, onSubmit, disabled }: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = members.filter(m =>
    mentionQuery === '' || m.name.toLowerCase().includes(mentionQuery.toLowerCase())
  ).slice(0, 6);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;

    // Find if cursor is inside a @mention
    const textBeforeCursor = val.slice(0, cursor);
    const atIdx = textBeforeCursor.lastIndexOf('@');

    if (atIdx !== -1 && !textBeforeCursor.slice(atIdx).includes(' ')) {
      setMentionStart(atIdx);
      setMentionQuery(textBeforeCursor.slice(atIdx + 1));
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
      setMentionStart(-1);
      setMentionQuery('');
    }

    onChange(val, mentionedIds);
  };

  const selectMember = (member: Member) => {
    if (mentionStart === -1) return;
    const before = value.slice(0, mentionStart);
    const after = value.slice(mentionStart + mentionQuery.length + 1);
    const newVal = `${before}@${member.name} ${after}`;
    const newIds = mentionedIds.includes(member.id) ? mentionedIds : [...mentionedIds, member.id];
    setMentionedIds(newIds);
    onChange(newVal, newIds);
    setShowDropdown(false);
    setMentionQuery('');
    setMentionStart(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Render comment with @mentions highlighted
  const renderHighlighted = () => {
    return value.split(/(@\w[\w\s]*?)(?=\s|$|@)/g).map((part, i) =>
      part.startsWith('@') && members.some(m => `@${m.name}` === part.trim())
        ? <span key={i} className="text-primary-600 font-medium">{part}</span>
        : <span key={i}>{part}</span>
    );
  };

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={e => {
          if (e.key === 'Enter' && !showDropdown && onSubmit) onSubmit();
          if (e.key === 'Escape') setShowDropdown(false);
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="input w-full"
      />
      {showDropdown && filtered.length > 0 && (
        <div className="absolute bottom-full mb-1 left-0 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {filtered.map(m => (
            <button
              key={m.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); selectMember(m); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-primary-50 text-left"
            >
              <div className="w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {m.name.charAt(0)}
              </div>
              <span>{m.name}</span>
            </button>
          ))}
          <p className="px-3 py-1.5 text-xs text-gray-400 border-t">Press Esc to dismiss</p>
        </div>
      )}
    </div>
  );
}
