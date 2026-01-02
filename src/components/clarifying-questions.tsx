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
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;

  const handleSelectOption = (label: string) => {
    setSelectedOption(label);
  };

  const handleNext = () => {
    if (!selectedOption || !currentQuestion) return;

    const newAnswers = {
      ...answers,
      [currentQuestion.id]: `${selectedOption}: ${currentQuestion.options.find(o => o.label === selectedOption)?.text}`,
    };
    setAnswers(newAnswers);

    if (isLastQuestion) {
      onComplete(newAnswers);
    } else {
      setCurrentIndex(currentIndex + 1);
      setSelectedOption(null);
    }
  };

  const handleSkipQuestion = () => {
    if (isLastQuestion) {
      onComplete(answers);
    } else {
      setCurrentIndex(currentIndex + 1);
      setSelectedOption(null);
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

        {/* Options */}
        <div className="space-y-2">
          {currentQuestion.options.map((option) => (
            <button
              key={option.label}
              onClick={() => handleSelectOption(option.label)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selectedOption === option.label
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-medium ${
                    selectedOption === option.label
                      ? "bg-blue-500 text-white"
                      : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  {option.label}
                </span>
                <div>
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
            disabled={!selectedOption}
            className="px-4 py-1.5 text-sm font-medium bg-white text-black rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLastQuestion ? "Generate" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
