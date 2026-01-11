declare module '*.json' {
  const value: any;
  export default value;
}

declare module '*.html' {
  const value: string;
  export default value;
}

// Figma global: contains HTML from manifest "ui" field
declare const __html__: string;

