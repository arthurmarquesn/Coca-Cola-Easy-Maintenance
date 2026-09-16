import { X } from "lucide-react";

interface FilterChipProps {
  label: string;
  onRemove: () => void;
}

export function FilterChip({
  label,
  onRemove,
}: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="group flex items-center gap-1.5 rounded-full border border-[#DEE1E5] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#323438] transition-colors duration-200 hover:border-[#F40009] hover:text-[#F40009]"
    >
      <span>{label}</span>

      <X
        size={13}
        strokeWidth={2}
        className="text-[#A0A5AC] transition-colors duration-200 group-hover:text-[#F40009]"
      />
    </button>
  );
}
