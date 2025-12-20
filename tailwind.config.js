/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {},
    },
    safelist: [
        {
            pattern: /(bg|text|border)-(slate|red|emerald|yellow|fuchsia|zinc)-(400|900)/,
        },
    ],
    plugins: [],
}
