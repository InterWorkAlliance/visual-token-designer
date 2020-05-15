import React from "react";

type Props = {
  title: string;
};

export default function ({ title }: Props) {
  const style: React.CSSProperties = {
    backgroundColor: 'var(--vscode-sideBarSectionHeader-background)',
    color: 'var(--vscode-sideBarTitle-foreground)',
    border: 'var(--borderWidth) solid var(--vscode-sideBarSectionHeader-border)',
    margin: 'var(--padding)',
    padding: 'var(--padding)',
    fontSize: '1.2em',
  };
  return <h1 style={style}>{title}</h1>;
}
