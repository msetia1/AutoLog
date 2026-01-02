"use client";

import { useState } from "react";
import type { ClarifyingQuestion } from "@/lib/openrouter";

interface ClarifyingQuestionsProps {
  questions: ClarifyingQuestion[];
  onComplete: (answers: Record<string, string>) => void;
  onSkip: () => void;
}

export function ClarifyingQuestions({
  questions,
  onComplete,
  onSkip,
}: ClarifyingQuestionsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;

  const handleToggleOption = (label: string) => {
    setSelectedOptions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(label)) {
        newSet.delete(label);
      } else {
        newSet.add(label);
      }
      return newSet;
    });
  };

  const handleNext = () => {
    if (selectedOptions.size === 0 || !currentQuestion) return;

    // Build answer string from selected options
    const selectedTexts = Array.from(selectedOptions)
      .map(label => {
        const opt = currentQuestion.options.find(o => o.label === label);
        return opt?.text;
      })
      .filter(Boolean)
      .join("; ");

    const newAnswers = {
      ...answers,
      [currentQuestion.id]: selectedTexts,
    };
    setAnswers(newAnswers);

    if (isLastQuestion) {
      onComplete(newAnswers);
    } else {
      setCurrentIndex(currentIndex + 1);
      setSelectedOptions(new Set());
    }
  };

  const handleSkipQuestion = () => {
    if (isLastQuestion) {
      onComplete(answers);
    } else {
      setCurrentIndex(currentIndex + 1);
      setSelectedOptions(new Set());
    }
  };

  if (!currentQuestion) {
    return null;
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/50">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-neutral-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm font-medium text-neutral-300">Questions</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <span>{currentIndex + 1} of {questions.length}</span>
        </div>
      </div>

      {/* Question */}
      <div className="p-5">
        <p className="text-white font-medium mb-4 leading-relaxed">
          {currentQuestion.question}
        </p>

        {/* Options - multi-select */}
        <p className="text-xs text-neutral-500 mb-3">Select all that apply</p>
        <div className="space-y-2">
          {currentQuestion.options.map((option) => (
            <button
              key={option.label}
              onClick={() => handleToggleOption(option.label)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selectedOptions.has(option.label)
                  ? "border-white/30 bg-white/10"
                  : "border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                    selectedOptions.has(option.label)
                      ? "bg-white border-white text-black"
                      : "border-neutral-600 text-transparent"
                  }`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <div className="flex-1">
                  <span className="text-neutral-200 text-sm">{option.text}</span>
                  {option.description && (
                    <p className="text-neutral-500 text-xs mt-0.5">
                      {option.description}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-800 bg-neutral-900/50">
        <button
          onClick={onSkip}
          className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          Skip all
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSkipQuestion}
            className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            disabled={selectedOptions.size === 0}
            className="px-4 py-1.5 text-sm font-medium bg-white/10 border border-white/30 text-white rounded-lg hover:bg-white/15 hover:border-white/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isLastQuestion ? "Generate" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
