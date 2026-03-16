#!/usr/bin/env bash
set -euo pipefail

# ATS Resume Agent - Dependency Checker & Installer
# Checks for Claude Code and LaTeX, offers to install what's missing.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }

echo ""
echo "ATS Resume Agent - Setup"
echo "========================"
echo ""

missing=()

# --- Claude Code ---
echo "Checking dependencies..."
echo ""

if command -v claude &>/dev/null; then
    ok "Claude Code is installed ($(claude --version 2>/dev/null || echo 'version unknown'))"
else
    fail "Claude Code is not installed"
    missing+=("claude")
fi

# --- pdflatex ---
if command -v pdflatex &>/dev/null; then
    ok "pdflatex is installed"
else
    fail "pdflatex is not installed (needed to compile resumes to PDF)"
    missing+=("pdflatex")
fi

# --- Check LaTeX packages (only if pdflatex exists) ---
if command -v pdflatex &>/dev/null && command -v kpsewhich &>/dev/null; then
    packages_ok=true
    for pkg in fontawesome5.sty fontawesome.sty CormorantGaramond.sty; do
        if ! kpsewhich "$pkg" &>/dev/null; then
            warn "LaTeX package missing: $pkg"
            packages_ok=false
        fi
    done
    if $packages_ok; then
        ok "Required LaTeX packages are installed"
    else
        missing+=("texpackages")
    fi
fi

echo ""

# --- Install missing dependencies ---
if [ ${#missing[@]} -eq 0 ]; then
    echo -e "${GREEN}All dependencies are installed. You're ready to go.${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Create your Master Career Document (run 'claude' and say 'Help me build my career document')"
    echo "  2. Drop a job description file in the project root"
    echo "  3. Run 'claude' and say 'Resume for the [Company] file'"
    echo ""
    exit 0
fi

echo "Some dependencies are missing. Install them now?"
echo ""

for dep in "${missing[@]}"; do
    case "$dep" in
        claude)
            read -rp "Install Claude Code? [y/N] " yn
            if [[ "$yn" =~ ^[Yy]$ ]]; then
                echo "Installing Claude Code..."
                curl -fsSL https://install.anthropic.com | sh
                ok "Claude Code installed"
            else
                warn "Skipped Claude Code (install later: curl -fsSL https://install.anthropic.com | sh)"
            fi
            ;;
        pdflatex)
            if [[ "$(uname)" == "Darwin" ]]; then
                read -rp "Install MacTeX via Homebrew? [y/N] " yn
                if [[ "$yn" =~ ^[Yy]$ ]]; then
                    brew install --cask mactex-no-gui
                    ok "MacTeX installed"
                else
                    warn "Skipped LaTeX (install later: brew install --cask mactex-no-gui)"
                fi
            elif command -v apt-get &>/dev/null; then
                read -rp "Install TeX Live via apt? [y/N] " yn
                if [[ "$yn" =~ ^[Yy]$ ]]; then
                    sudo apt-get install -y texlive-latex-base texlive-fonts-recommended \
                        texlive-fonts-extra texlive-latex-extra
                    ok "TeX Live installed"
                else
                    warn "Skipped LaTeX (install later: sudo apt-get install texlive-latex-base texlive-fonts-recommended texlive-fonts-extra texlive-latex-extra)"
                fi
            else
                warn "Could not detect package manager. Install pdflatex manually -- see README for instructions."
            fi
            ;;
        texpackages)
            read -rp "Install missing LaTeX packages via tlmgr? [y/N] " yn
            if [[ "$yn" =~ ^[Yy]$ ]]; then
                sudo tlmgr update --self
                sudo tlmgr install fontawesome5 fontawesome CormorantGaramond charter \
                    ragged2e microtype lastpage bookmark tabularx enumitem titlesec fancyhdr
                ok "LaTeX packages installed"
            else
                warn "Skipped LaTeX packages (install later with tlmgr)"
            fi
            ;;
    esac
    echo ""
done

echo "Setup complete. Run 'claude' in this directory to get started."
echo ""
