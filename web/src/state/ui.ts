import { atom } from "jotai";
import { defaultConsoleSection, type ConsoleSection } from "../routes/console-model";

export const activeConsoleSectionAtom = atom<ConsoleSection>(defaultConsoleSection);
