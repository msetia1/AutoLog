"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";

interface DropdownOption {
  id: string | number;
  label: string;
  description?: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  disabled = false,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.label === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (option: DropdownOption) => {
    onChange(option.label);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative w-full max-w-md">
      {/* Dropdown Button */}
      <motion.button
        type="button"
        whileTap={{ scale: disabled ? 1 : 0.995 }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-4 py-3 rounded-lg border transition-all duration-200 ${
          disabled
            ? "opacity-50 cursor-not-allowed border-neutral-800 text-neutral-500"
            : "border-neutral-800 text-white hover:border-neutral-600"
        } bg-transparent flex items-center justify-between text-sm`}
      >
        <span className={selectedOption ? "text-white" : "text-neutral-500"}>
          {selectedOption?.label || placeholder}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-neutral-500" />
        </motion.div>
      </motion.button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-2 rounded-lg border border-neutral-800 overflow-hidden shadow-2xl bg-[#0a0a0a]"
          >
            <div className="max-h-[280px] overflow-y-auto">
              {options.map((option, index) => (
                <motion.button
                  type="button"
                  key={option.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.1, delay: index * 0.02 }}
                  onClick={() => handleSelect(option)}
                  className={`w-full px-4 py-3 text-left transition-colors duration-150 hover:bg-white hover:text-black text-white flex items-center justify-between group ${
                    index !== options.length - 1 ? "border-b border-neutral-800/50" : ""
                  }`}
                >
                  <div>
                    <div className="text-sm">{option.label}</div>
                    {option.description && (
                      <div className="text-xs text-neutral-500 group-hover:text-neutral-600 mt-0.5">
                        {option.description}
                      </div>
                    )}
                  </div>
                  {value === option.label && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    >
                      <Check className="w-4 h-4" />
                    </motion.div>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Dropdown;
