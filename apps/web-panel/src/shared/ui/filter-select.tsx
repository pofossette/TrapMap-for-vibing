import { ListBox, Select } from '@heroui/react';
import type { ReactElement } from 'react';

interface FilterSelectOption {
  id: string;
  label: string;
}

interface FilterSelectProps {
  onChange(value: string): void;
  options: FilterSelectOption[];
  value: string;
}

export function FilterSelect({ onChange, options, value }: FilterSelectProps): ReactElement {
  return (
    <Select
      className="w-full"
      value={value}
      onChange={(val) => onChange(val ? String(val) : 'all')}
    >
      <Select.Trigger className="h-panel-control relative w-full flex items-center justify-between rounded-panel-md border border-panel-line bg-panel-surface px-3 text-sm text-panel-text focus:outline-none focus:ring-1 focus:ring-panel-accent cursor-pointer transition duration-200 outline-none">
        <Select.Value />
        <Select.Indicator className="text-panel-muted transition-transform duration-200" />
      </Select.Trigger>
      <Select.Popover className="min-w-[220px] rounded-xl border border-panel-line bg-panel-surface p-1.5 shadow-panel">
        <ListBox className="outline-none">
          {options.map((option) => (
            <ListBox.Item
              key={option.id}
              id={option.id}
              textValue={option.label}
              className="flex min-h-[36px] items-center justify-between px-3 py-2 text-sm rounded-panel-sm text-panel-text hover:bg-panel-elevated/60 cursor-pointer outline-none data-[focused=true]:bg-panel-elevated/60 data-[selected=true]:text-panel-accent data-[selected=true]:font-medium transition duration-150"
            >
              {option.label}
              <ListBox.ItemIndicator>
                <svg
                  role="img"
                  aria-label="Selected"
                  className="h-4 w-4 text-panel-accent shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <title>Selected</title>
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </ListBox.ItemIndicator>
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
