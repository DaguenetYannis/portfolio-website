// Projects data structure
// This file contains metadata for portfolio projects

export interface Project {
  id: string;
  title: string;
  description: string;
  tags: string[];
  date: string;
  slug: string;
}

export const projects: Project[] = [
  // Projects will be added here
];
