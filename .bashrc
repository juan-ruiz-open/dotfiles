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
alias apis="cd ~/Coding/dev-front/openintl-apis"

alias orapps="code ~/Coding/dev-front/openintl-reactapps"
alias os602="code ~/Coding/dev-front/openintl-sencha602"
alias os653="code ~/Coding/dev-front/openintl-sencha653"
alias oapis="code ~/Coding/dev-front/openintl-apis"

alias orapps-r="code ~/Coding/dev-front/openintl-reactapps -r"
alias os602-r="code ~/Coding/dev-front/openintl-sencha602 -r"
alias os653-r="code ~/Coding/dev-front/openintl-sencha653 -r"
alias oapis-r="code ~/Coding/dev-front/openintl-apis -r"

alias blitz="sh ~/Coding/dev-front/blitz/blitz.sh"

alias bashrc="code ~/Coding/dotfiles/.bashrc"
alias git-prompt="code ~/Coding/dotfiles/custom-git-prompt.sh"
alias dotfiles="sh ~/Coding/dotfiles/dotfiles.sh"

alias connections="code C:/Users/jruiz/AppData/Roaming/Code/User/openplsqltools/connections.sql"

alias nopen="nvm use 14.15.0 && source ~/.bashrc"
alias nnew="nvm use newest && source ~/.bashrc"