import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';

interface TooltipProps {
  content: string;
  label: string;
  children: (triggerProps: {
    tooltipId: string;
    isOpen: boolean;
    onTriggerClick: () => void;
    onTriggerFocus: () => void;
    onTriggerPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  }) => ReactNode;
}

export function Tooltip({content, label, children}: TooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const pointerTypeRef = useRef<'mouse' | 'touch' | 'pen' | null>(null);
  const tooltipId = useId();

  const isOpen = isHovered || isFocused || isPinned;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHovered(false);
        setIsFocused(false);
        setIsPinned(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div
      className="relative h-full"
      onMouseEnter={() => {
        if (pointerTypeRef.current !== 'touch') {
          setIsHovered(true);
        }
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPinned(false);
        pointerTypeRef.current = null;
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsFocused(false);
          setIsPinned(false);
        }
      }}
    >
      {children({
        tooltipId,
        isOpen,
        onTriggerPointerDown: (event) => {
          pointerTypeRef.current =
            event.pointerType === 'touch' || event.pointerType === 'pen'
              ? event.pointerType
              : 'mouse';
        },
        onTriggerFocus: () => {
          if (pointerTypeRef.current === null) {
            setIsFocused(true);
          }
        },
        onTriggerClick: () => {
          const isTouch = pointerTypeRef.current === 'touch';
          pointerTypeRef.current = null;

          if (isTouch) {
            setIsHovered(false);
            setIsPinned((prev) => !prev);
            return;
          }

          setIsPinned((prev) => (isHovered ? true : !prev));
        },
      })}

      {isOpen && (
        <div
          id={tooltipId}
          role="tooltip"
          aria-label={label}
          className="pointer-events-none absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border border-slate-700 bg-slate-900 p-3.5 text-xs leading-relaxed text-slate-100 shadow-lg"
        >
          <div
            aria-hidden="true"
            className="absolute -top-1.5 left-6 h-3 w-3 rotate-45 border-t border-l border-slate-700 bg-slate-900"
          />
          <p className="font-semibold text-white">{label}</p>
          <p className="mt-1 text-slate-200">{content}</p>
        </div>
      )}
    </div>
  );
}
