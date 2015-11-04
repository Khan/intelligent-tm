/**
 * This file contains functions generating suggested translations.  See the
 * jsdocs for the 'suggest' function for more details.
 */


// Matches math delimited by $, e.g.
// $x^2 + 2x + 1 = 0$
// $\text{cost} = \$4$
const MATH_REGEX = /\$(\\\$|[^\$])+\$/g;

// Matches graphie strings,
// e.g. ![](web+graphie://ka-perseus-graphie.s3.amazonaws.com/542f2b4e297910eed545a5c29c3866918655bab4)
const GRAPHIE_REGEX = /\!\[\]\([^)]+\)/g;

// Matches widget strings, e.g. [[☃ Expression 1]]
const WIDGET_REGEX = /\[\[[\u2603][^\]]+\]\]/g;

// Matches all placeholders
const PLACEHOLDER_REGEX = /__(?:MATH|GRAPHIE|WIDGET)__/g;

// Matches bold strings in markdown syntax, e.g. "This is **bold**"
const BOLD_REGEX = /\*\*.*\*\*/g;

// Use two line feeds to split lines because this is how Markdown delineates
// paragraphs.
const LINE_BREAK = '\n\n';


const identity = x => x;


/**
 * Normalizes a string.  This is used when determining groups so that we don't
 * create groups based on non natural language text differences.
 *
 * We replace math, graphies, and widgets with placehodlers and remove
 * unimportant whitespace differences on the item so that we can group
 * strings with similar natural language text.  We also disregard bold
 * markup when determining a match.  This means that translators may
 * have to add bold markkup to the suggestion in some cases.
 *
 * @param {string} str The string to normalize.
 * @returns {string} The normalized string.
 */
function normalizeString(str) {
    return str.replace(MATH_REGEX, '__MATH__')
        .replace(GRAPHIE_REGEX, '__GRAPHIE__')
        .replace(WIDGET_REGEX, '__WIDGET__')
        .replace(/__MATH__[\t ]*__WIDGET__/g, '__MATH__ __WIDGET__')
        .replace(BOLD_REGEX,
            (match) => match.substring(2, match.length - 2))
        .split(LINE_BREAK).map((line) => line.trim()).join(LINE_BREAK);
}

/**
 * Group objects that contain English strings to translate.
 *
 * Groups are determined by the similarity between the English strings returned
 * by calling `byGroup` on each object in `objects`.  In order to find more
 * matches we ignore math, graphie, and widget substrings.
 *
 * Example:
 * let items = [
 *    {
 *        englishStr: "simplify $2/4$\n\nhint: the denominator is $2$",
 *        id: 1001,
 *    }, {
 *        englishStr: "simplify $3/12$\n\nhint: the denominator is $4$",
 *        id: 1002,
 *    }
 * ];
 *
 * let stringMatches = groupStrings(items, item => item.englishStr);
 *
 * The result is:
 * {
 *    "simplify __MATH__\n\\nhint: denominator is __MATH__": [{
 *        englishStr: "simplify $2/4$\n\nhint: the denominator is $2$",
 *        id: 1001,
 *    }, {
 *        englishStr: "simplify $3/12$\n\nhint: the denominator is $4$",
 *        id: 1002,
 *    }]
 * }
 *
 * @param {Array} items An array of objects to be grouped based on a related
 *        English string to translate.
 * @param {Function} [getEnglishStr] A function that is passed a value from
 *        `items` and returns the English string to translate.
 * @returns {Object} An object where the keys are English strings to be
 *          translated and the values are an array of one or more objects from
 *          items.
 */
function group(items, getEnglishStr = identity) {
    // stringMatches contains entries where one string matches another string
    // ignoring math, graphie, and widgets.  The key is the string after math,
    // graphies, and widgets had been replaced with placeholders
    var stringMatches = {};

    items.forEach(function(obj) {
        var str = normalizeString(getEnglishStr(obj));

        if (stringMatches[str]) {
            stringMatches[str].push(obj);
        } else {
            stringMatches[str] = [obj];
        }
    });

    return stringMatches;
}

/**
 * Returns a mapping between the order of special substrings such as math
 * strings in translatedStr and their order in englishStr.
 *
 * Example:
 * let mapping = getMapping(
 *    "simplify $2/4$\n\nhint: the denominator is $2$",
 *    "hintz: da denom $2$ iz $2$\n\nsimplifz $2/4$",
 *    "es",
 *    MATH_REGEX
 * );
 *
 * // mapping = [1,1,0];
 *
 * This mapping array indicates that the first two __MATH__ placeholders in the
 * translated string template should be replaced with the second math block
 * from the English string we're translating.  The third __MATH__ placeholder
 * should be replaced by the first math block from the English string we're
 * translating.
 *
 * @param {String} englishStr The English source string.
 * @param {String} translatedStr The translation of the englishStr.
 * @param {String} lang ka_locale of translatedStr.
 * @param {RegExp} findRegex A regex that matches math, graphies, or widgets.
 *        Use one of MATH_REGEX, GRAPHIE_REGEX, or WIDGET_REGEX.
 * @returns {Array} An array representing the mapping.
 */
function getMapping(englishStr, translatedStr, lang, findRegex) {
    const inputs = englishStr.match(findRegex) || [];
    const outputs = translatedStr.match(findRegex) || [];

    const mapping = [];

    outputs.forEach((output, outputIndex) => {
        // TODO(kevinb): handle \text{} inside math
        if (lang === 'pt') {
            output = output.replace(/\\operatorname\{sen\}/g, '\\sin');
        }
        const inputIndex = inputs.indexOf(output);
        if (inputIndex === -1) {
            if (findRegex === MATH_REGEX) {
                throw new Error('math doesn\'t match');
            } else if (findRegex === GRAPHIE_REGEX) {
                throw new Error('graphies don\'t match');
            } else if (findRegex === WIDGET_REGEX) {
                throw new Error('widgets don\'t match');
            } else {
                throw new Error('the only acceptable values for getFunc are ' +
                    'getMaths, getGraphies, and getWdigets');
            }
        }
        mapping[outputIndex] = inputIndex;
    });

    return mapping;
}

/**
 * Creates a template object based on englishStr and translatedStr strings.
 *
 * All math, graphie, and widget sub-strings are replaced by placeholders and
 * the mappings for which sub-string goes where in the translatedStr.  The
 * englishStr is split into lines.  While this isn't particular useful right
 * now, the plan is to eventually use the lines creating suggestions for
 * partial matches.
 *
 * @param {string} englishStr An English string.
 * @param {string} translatedStr The translation of the englishStr.
 * @param {string} lang The ka_locale of the translatedStr.
 * @returns {Object|Error} A template object which is passed to
 *          populateTemplate to generate suggestions for strings that haven't
 *          been translated yet.
 */
function createTemplate(englishStr, translatedStr, lang) {
    const translatedLines = translatedStr.split(LINE_BREAK);
    try {
        return {
            lines: translatedLines.map(
                (line) => line.replace(MATH_REGEX, '__MATH__')
                    .replace(GRAPHIE_REGEX, '__GRAPHIE__')
                    .replace(WIDGET_REGEX, '__WIDGET__')),
            mathMapping:
                getMapping(englishStr, translatedStr, lang, MATH_REGEX),
            graphieMapping:
                getMapping(englishStr, translatedStr, lang, GRAPHIE_REGEX),
            widgetMapping:
                getMapping(englishStr, translatedStr, lang, WIDGET_REGEX),
        };
    } catch(e) {
        return e;
    }
}

/**
 * Handles any per language special case translations, e.g. Portuguese uses
 * `sen` instead of `sin`.
 *
 * @param {string} math
 * @param {string} lang
 * @returns {string}
 */
function translateMath(math, lang) {
    if (lang === 'pt') {
        return math.replace(/\\sin/g, '\\operatorname\{sen\}');
    } else {
        return math;
    }
}

/**
 * Returns a translations suggestion based the given template and englishStr.
 *
 * @param {Object} template A template object return by createTemplate.
 * @param {string} englishStr The English string to be translated.
 * @param {string} lang The ka_locale that was used when creating the template.
 * @returns {string} The suggested translation.
 */
function populateTemplate(template, englishStr, lang) {
    const englishLines = englishStr.split(LINE_BREAK);

    let maths = englishStr.match(MATH_REGEX) || [];
    const graphies = englishStr.match(GRAPHIE_REGEX) || [];
    const widgets = englishStr.match(WIDGET_REGEX) || [];

    let mathIndex = 0;
    let graphieIndex = 0;
    let widgetIndex = 0;

    maths = maths.map(translateMath);

    return englishLines.map((englishLine, index) => {
        const templateLine = template.lines[index];

        return templateLine.replace(/__MATH__/g, () =>
            maths[template.mathMapping[mathIndex++]]
        ).replace(/__GRAPHIE__/g, () =>
            graphies[template.graphieMapping[graphieIndex++]]
        ).replace(/__WIDGET__/g, () =>
            widgets[template.widgetMapping[widgetIndex++]]
        );
    }).join(LINE_BREAK);
}

/**
 * Automatically translate strings that are simply math, graphies, or widgets.
 * The translations for other items will be null, see @returns for details.
 *
 * @param {Array} items Objects that are passed to getEnglishStr which must
 *        return the English string to translate for that item.
 * @param {string} lang The ka_locale of the translated strings in
 *        translationPairs.
 * @param {Function} [getEnglishStr] A function that is passed one of the items
 *        and returns the English string to be translated.
 * @returns {Array} Pairs containing entries from items along with the
 *          accompanying translations.
 */
function autoTranslatePlaceholders(items, lang, getEnglishStr) {
    return items.map(item => {
        const englishStr = getEnglishStr(item);
        const normalStr = normalizeString(englishStr);

        if (/^(__MATH__|__GRAPHIE__|__WIDGET__)$/.test(normalStr)) {
            let translatedStr = englishStr;
            if (normalStr === '__MATH__') {
                // ignore math that might contain natural language
                if (englishStr.indexOf('\\text') !== -1) {
                    return [englishStr, null];
                }
                translatedStr = translateMath(translatedStr, lang);
            }
            return [item, translatedStr];
        } else {
            return [item, null];
        }
    });
}

/**
 * Returns the first valid English/translated pair.
 *
 * @param {Array} translationPairs An array of [englishStr, translatedStr]
 *        pairs, at least one should contain non empty, non-null strings.
 * @returns {Array|Error} An array containing an English/translated string
 *          pair.  It returns an Error if no pair exists.
 */
function findTranslationPair(translationPairs) {
    for (let i = 0; i < translationPairs.length; i++) {
        const pair = translationPairs[i];
        if (pair[0] && pair[1]) {
            return pair;
        }
    }
    return new Error('couldn\'t find translation pair');
}

/**
 * Returns an Array of suggested translations.
 *
 * @param {Array} translationPairs An array of [englishStr, translatedStr]
 *        pairs, at least one should contain non empty, non-null string.
 * @param {Array} items An array of objects that are passed to getEnglishStr
 *        which must return the English string to translate for that item.
 * @param {string} lang The ka_locale of the translated strings in
 *        translationPairs.
 * @param {Function} [getEnglishStr] A function that is passed one of the items
 *        and returns the English string to be translated.
 * @returns {Array|Error} An array of pairs containing entries from items
 *          along with the accompanying translations.
 */
function suggest(translationPairs, items, lang, getEnglishStr = identity) {
    const pair = findTranslationPair(translationPairs);
    const groups = group(items, getEnglishStr);

    if (pair instanceof Error || Object.keys(groups).length > 1) {
        return autoTranslatePlaceholders(items, lang, getEnglishStr);
    }

    const template = createTemplate(...pair, lang);

    if (template instanceof Error) {
        return template;
    }

    return items.map(item =>
        [item, populateTemplate(template, getEnglishStr(item), lang)]);
}

module.exports = {
    createTemplate,
    populateTemplate,
    group,
    suggest,
    normalizeString,
};
