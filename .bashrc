# Desactivar el prompt por defecto del sistema
unset PS1

# Cargar el git-prompt personalizado desde la ubicación externa
if [ -f "/c/users/jruiz/custom-git-prompt.sh" ]; then
    source "/c/users/jruiz/custom-git-prompt.sh"
fi

shopt -s histappend
PROMPT_COMMAND='history -a; history -n; '

# Custom aliases
alias rt="source ~/.bashrc && clear"

alias reboot="shutdown /r /t 0"

alias home="cd ~"
alias coding="cd ~/Coding/"
alias front="cd ~/Coding/dev-front"
alias back="cd ~/Coding/dev-back"
alias rapps="cd ~/Coding/dev-front/openintl-reactapps"
alias s602="cd ~/Coding/dev-front/openintl-sencha602"
alias s653="cd ~/Coding/dev-front/openintl-sencha653"

alias blitz="sh ~/Coding/dev-front/blitz/blitz.sh"

alias bashrc="code ~/Coding/dotfiles/.bashrc"
alias git-prompt="code ~/Coding/dotfiles/custom-git-prompt.sh"
alias dotfiles="sh ~/Coding/dotfiles/dotfiles.sh"

alias connections="code C:/Users/jruiz/AppData/Roaming/Code/User/openplsqltools/connections.sql"

alias nopen="nvm use 14.15.0 && source ~/.bashrc"
alias nnew="nvm use newest && source ~/.bashrc"