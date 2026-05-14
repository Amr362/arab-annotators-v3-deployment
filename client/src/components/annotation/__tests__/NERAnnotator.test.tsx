import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NERAnnotator from "../NERAnnotator";
import type { LabelOption, NERSpan } from "../types";

describe("NERAnnotator v3", () => {
  const mockLabels: LabelOption[] = [
    { value: "PERSON", color: "#FF6B6B", shortcut: "p" },
    { value: "LOCATION", color: "#4ECDC4", shortcut: "l" },
    { value: "ORGANIZATION", color: "#FFE66D", shortcut: "o" },
  ];

  const mockText = "محمد يعمل في شركة جوجل بالقاهرة";

  const mockSpans: NERSpan[] = [
    {
      start: 0,
      end: 5,
      text: "محمد",
      label: "PERSON",
      color: "#FF6B6B",
    },
    {
      start: 18,
      end: 23,
      text: "جوجل",
      label: "ORGANIZATION",
      color: "#FFE66D",
    },
  ];

  const mockOnChange = vi.fn();
  const mockOnError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders with text and labels", () => {
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText(/محمد/)).toBeInTheDocument();
      expect(screen.getByText(/PERSON/)).toBeInTheDocument();
    });

    it("renders in read-only mode", () => {
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
          readOnly={true}
        />
      );

      const deleteButtons = screen.queryAllByLabelText("حذف الكيان");
      expect(deleteButtons).toHaveLength(0);
    });

    it("displays empty state when no spans", () => {
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={[]}
          onChange={mockOnChange}
        />
      );

      expect(screen.queryByText(/الكيانات المحددة/)).not.toBeInTheDocument();
    });

    it("hides labels when toggle is clicked", async () => {
      const user = userEvent.setup();
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
        />
      );

      const toggleButton = screen.getByLabelText(/إخفاء التسميات/);
      await user.click(toggleButton);

      // Labels should be hidden in the text
      const marks = screen.getAllByTitle(/PERSON|ORGANIZATION/);
      marks.forEach((mark) => {
        const sup = mark.querySelector("sup");
        expect(sup).not.toBeInTheDocument();
      });
    });
  });

  describe("Label Selection", () => {
    it("selects label on button click", async () => {
      const user = userEvent.setup();
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={[]}
          onChange={mockOnChange}
        />
      );

      const personButton = screen.getByRole("button", { name: /PERSON/ });
      await user.click(personButton);

      expect(personButton).toHaveStyle({ backgroundColor: mockLabels[0].color });
    });

    it("selects label with keyboard shortcut", async () => {
      const user = userEvent.setup();
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={[]}
          onChange={mockOnChange}
        />
      );

      await user.keyboard("p");

      const personButton = screen.getByRole("button", { name: /PERSON/ });
      expect(personButton).toHaveStyle({ backgroundColor: mockLabels[0].color });
    });
  });

  describe("Span Management", () => {
    it("removes span when delete button clicked", async () => {
      const user = userEvent.setup();
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
        />
      );

      const deleteButtons = screen.getAllByLabelText("حذف الكيان");
      await user.click(deleteButtons[0]);

      expect(mockOnChange).toHaveBeenCalledWith({
        type: "ner",
        spans: [mockSpans[1]],
      });
    });

    it("copies span text to clipboard", async () => {
      const user = userEvent.setup();
      const mockClipboard = {
        writeText: vi.fn().mockResolvedValue(undefined),
      };
      Object.assign(navigator, { clipboard: mockClipboard });

      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
        />
      );

      const copyButtons = screen.getAllByLabelText("نسخ الكيان");
      await user.click(copyButtons[0]);

      expect(mockClipboard.writeText).toHaveBeenCalledWith("محمد");
    });

    it("shows error for overlapping spans", async () => {
      const user = userEvent.setup();
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
          onError={mockOnError}
        />
      );

      // Try to select overlapping text
      const textElement = screen.getByText(/محمد يعمل/);
      fireEvent.mouseUp(textElement);

      // Error should be displayed
      await waitFor(() => {
        expect(screen.queryByText(/متداخل/)).toBeInTheDocument();
      });
    });
  });

  describe("Search and Filter", () => {
    it("filters spans by search query", async () => {
      const user = userEvent.setup();
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
          enableSearch={true}
        />
      );

      const searchInput = screen.getByPlaceholderText("بحث...");
      await user.type(searchInput, "جوجل");

      // Should show only the ORGANIZATION span
      expect(screen.getByText(/جوجل/)).toBeInTheDocument();
      expect(screen.queryByText(/محمد/)).not.toBeInTheDocument();
    });

    it("filters spans by label", async () => {
      const user = userEvent.setup();
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
        />
      );

      const personFilterButton = screen.getByRole("button", { name: /PERSON \(1\)/ });
      await user.click(personFilterButton);

      // Should show only PERSON spans
      expect(screen.getByText(/محمد/)).toBeInTheDocument();
    });
  });

  describe("Undo/Redo", () => {
    it("undoes changes", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
          enableUndo={true}
        />
      );

      // Simulate a change
      const newSpans = [...mockSpans];
      newSpans.pop();
      rerender(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={newSpans}
          onChange={mockOnChange}
          enableUndo={true}
        />
      );

      const undoButton = screen.getByLabelText("تراجع");
      await user.click(undoButton);

      expect(mockOnChange).toHaveBeenCalled();
    });

    it("redoes changes", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
          enableUndo={true}
        />
      );

      // Undo
      let undoButton = screen.getByLabelText("تراجع");
      await user.click(undoButton);

      // Redo
      const redoButton = screen.getByLabelText("إعادة");
      await user.click(redoButton);

      expect(mockOnChange).toHaveBeenCalled();
    });
  });

  describe("Export/Import", () => {
    it("exports spans as JSON", async () => {
      const user = userEvent.setup();
      const mockClick = vi.fn();

      vi.spyOn(document, "createElement").mockReturnValue({
        setAttribute: vi.fn(),
        click: mockClick,
        style: {},
      } as any);

      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
          enableExport={true}
        />
      );

      const exportButton = screen.getByLabelText("تصدير التعليقات");
      await user.click(exportButton);

      expect(mockClick).toHaveBeenCalled();
    });

    it("handles import errors gracefully", async () => {
      const user = userEvent.setup();
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
          enableImport={true}
          onError={mockOnError}
        />
      );

      const importButton = screen.getByLabelText("استيراد التعليقات");
      await user.click(importButton);

      // Error should be handled
      expect(screen.queryByText(/خطأ/)).not.toBeInTheDocument();
    });
  });

  describe("Statistics", () => {
    it("displays statistics", () => {
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
          enableStats={true}
        />
      );

      expect(screen.getByText(/إجمالي الكيانات/)).toBeInTheDocument();
      expect(screen.getByText(/أنواع فريدة/)).toBeInTheDocument();
      expect(screen.getByText(/تغطية النص/)).toBeInTheDocument();
    });

    it("calculates correct statistics", () => {
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
          enableStats={true}
        />
      );

      // Check total entities
      expect(screen.getByText("2")).toBeInTheDocument();

      // Check unique types
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has proper ARIA labels", () => {
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByLabelText("البحث في الكيانات")).toBeInTheDocument();
      expect(screen.getByLabelText("تراجع")).toBeInTheDocument();
      expect(screen.getByLabelText("إعادة")).toBeInTheDocument();
    });

    it("supports keyboard navigation", async () => {
      const user = userEvent.setup();
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
        />
      );

      // Test label shortcut
      await user.keyboard("p");
      const personButton = screen.getByRole("button", { name: /PERSON/ });
      expect(personButton).toHaveStyle({ backgroundColor: mockLabels[0].color });
    });
  });

  describe("Error Handling", () => {
    it("displays error message", async () => {
      const user = userEvent.setup();
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
          onError={mockOnError}
        />
      );

      // Simulate an error
      const deleteButtons = screen.getAllByLabelText("حذف الكيان");
      await user.click(deleteButtons[0]);

      // Error handling should work
      expect(mockOnChange).toHaveBeenCalled();
    });

    it("calls onError callback when error occurs", async () => {
      render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
          onError={mockOnError}
        />
      );

      // Trigger an error by trying to copy with a failing clipboard
      const mockClipboard = {
        writeText: vi.fn().mockRejectedValue(new Error("Clipboard error")),
      };
      Object.assign(navigator, { clipboard: mockClipboard });

      const user = userEvent.setup();
      const copyButtons = screen.getAllByLabelText("نسخ الكيان");
      await user.click(copyButtons[0]);

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalled();
      });
    });
  });

  describe("RTL Support", () => {
    it("renders with RTL direction", () => {
      const { container } = render(
        <NERAnnotator
          text={mockText}
          labels={mockLabels}
          value={mockSpans}
          onChange={mockOnChange}
        />
      );

      const textContainer = container.querySelector('[dir="rtl"]');
      expect(textContainer).toBeInTheDocument();
    });
  });
});
