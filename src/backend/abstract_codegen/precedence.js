'use strict';

// ---------------------------------------------------------------------------
// Shared textual precedence helper for string-based backend emitters.
// ---------------------------------------------------------------------------

/**
 * Shared textual precedence helper for string-based backend emitters.
 *
 * @protected
 * @typedef {{
 *   PREC_ASSIGN_: number,
 *   PREC_CONDITIONAL_: number,
 *   PREC_BIT_OR_: number,
 *   PREC_BIT_XOR_: number,
 *   PREC_BIT_AND_: number,
 *   PREC_EQUALITY_: number,
 *   PREC_RELATIONAL_: number,
 *   PREC_SHIFT_: number,
 *   PREC_ADDITIVE_: number,
 *   PREC_MULTIPLICATIVE_: number,
 *   PREC_UNARY_: number,
 *   PREC_PRIMARY_: number,
 *   isUnaryPosition_: function(string, number): boolean,
 *   isFullyParenthesized: function(string): boolean,
 *   topLevel: function(string): number,
 *   wrap: function(string, number, boolean): string,
 *   renderPrefix: function(string, string): string,
 *   renderInfix: function(string, string, string, number, boolean=): string,
 *   formatCondition: function(string): string,
 *   stripOuter: function(string): string
 * }}
 */
Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_;

/**
 * Shared textual precedence helper for string-based backend emitters.
 *
 * The helper scans already-rendered expressions and only adds grouping when a
 * caller requests it for precedence/parse correctness. Concrete backends keep
 * their own coercion helpers on top of this while reusing the same grouping
 * rules for infix/prefix rendering and statement conditions.
 *
 * @protected
 * @const {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_}
 */
Wasm2Lang.Backend.AbstractCodegen.Precedence_ = /** @type {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_} */ ({
  PREC_ASSIGN_: 1,
  PREC_CONDITIONAL_: 2,
  PREC_BIT_OR_: 3,
  PREC_BIT_XOR_: 4,
  PREC_BIT_AND_: 5,
  PREC_EQUALITY_: 6,
  PREC_RELATIONAL_: 7,
  PREC_SHIFT_: 8,
  PREC_ADDITIVE_: 9,
  PREC_MULTIPLICATIVE_: 10,
  PREC_UNARY_: 11,
  PREC_PRIMARY_: 12,

  /**
   * @param {string} expr
   * @param {number} index
   * @return {boolean}
   */
  isUnaryPosition_: function (expr, index) {
    var /** @type {number} */ i = index - 1;

    while (0 <= i && /\s/.test(expr.charAt(i))) {
      --i;
    }
    if (0 > i) {
      return true;
    }

    return -1 !== '([?:=,+-*/%&|^!<>'.indexOf(expr.charAt(i));
  },

  /**
   * @param {string} expr
   * @return {boolean}
   */
  isFullyParenthesized: function (expr) {
    var /** @type {number} */ start = 0;
    var /** @type {number} */ end = expr.length - 1;
    var /** @type {number} */ depth = 0;
    var /** @type {number} */ i = 0;

    while (start <= end && /\s/.test(expr.charAt(start))) {
      ++start;
    }
    while (end >= start && /\s/.test(expr.charAt(end))) {
      --end;
    }
    if (start >= end || '(' !== expr.charAt(start) || ')' !== expr.charAt(end)) {
      return false;
    }

    for (i = start; i <= end; ++i) {
      var /** @const {string} */ ch = expr.charAt(i);
      if ('(' === ch) {
        ++depth;
      } else if (')' === ch) {
        --depth;
        if (0 === depth && i !== end) {
          return false;
        }
        if (0 > depth) {
          return false;
        }
      }
    }

    return 0 === depth;
  },

  /**
   * @param {string} expr
   * @return {number}
   */
  topLevel: function (expr) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_} */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    var /** @const {string} */ s = expr.replace(/^\s+|\s+$/g, '');
    var /** @type {number} */ depthParen = 0;
    var /** @type {number} */ depthBracket = 0;
    var /** @type {boolean} */ inSingle = false;
    var /** @type {boolean} */ inDouble = false;
    var /** @type {boolean} */ escaped = false;
    var /** @type {number} */ lowest = P.PREC_PRIMARY_;
    var /** @type {number} */ i = 0;
    var /** @const {number} */ sLen = s.length;
    var /** @type {string} */ next = '';

    if ('' === s || P.isFullyParenthesized(s)) {
      return P.PREC_PRIMARY_;
    }

    for (i = 0; i < sLen; ++i) {
      var /** @const {string} */ ch = s.charAt(i);

      // --- string literal pass-through ---
      if (inSingle) {
        if (escaped) {
          escaped = false;
        } else if ('\\' === ch) {
          escaped = true;
        } else if ("'" === ch) {
          inSingle = false;
        }
        continue;
      }
      if (inDouble) {
        if (escaped) {
          escaped = false;
        } else if ('\\' === ch) {
          escaped = true;
        } else if ('"' === ch) {
          inDouble = false;
        }
        continue;
      }

      // --- structural / nesting characters ---
      switch (ch) {
        case "'":
          inSingle = true;
          continue;
        case '"':
          inDouble = true;
          continue;
        case '(':
          ++depthParen;
          continue;
        case ')':
          --depthParen;
          continue;
        case '[':
          ++depthBracket;
          continue;
        case ']':
          --depthBracket;
          continue;
        default:
          break;
      }

      if (0 !== depthParen || 0 !== depthBracket) {
        continue;
      }

      // --- operator precedence detection (top-level only) ---
      next = s.charAt(i + 1);
      switch (ch) {
        case '?':
          lowest = Math.min(lowest, P.PREC_CONDITIONAL_);
          break;
        case '|':
          if ('|' !== next) {
            lowest = Math.min(lowest, P.PREC_BIT_OR_);
          }
          break;
        case '^':
          lowest = Math.min(lowest, P.PREC_BIT_XOR_);
          break;
        case '&':
          if ('&' !== next) {
            lowest = Math.min(lowest, P.PREC_BIT_AND_);
          }
          break;
        case '=':
          if ('=' === next) {
            lowest = Math.min(lowest, P.PREC_EQUALITY_);
            i += '=' === s.charAt(i + 2) ? 2 : 1;
          } else if ('!' !== s.charAt(i - 1) && '<' !== s.charAt(i - 1) && '>' !== s.charAt(i - 1)) {
            lowest = Math.min(lowest, P.PREC_ASSIGN_);
          }
          break;
        case '!':
          if ('=' === next) {
            lowest = Math.min(lowest, P.PREC_EQUALITY_);
            i += '=' === s.charAt(i + 2) ? 2 : 1;
          } else if (P.isUnaryPosition_(s, i)) {
            lowest = Math.min(lowest, P.PREC_UNARY_);
          }
          break;
        case '<':
          if ('<' === next) {
            lowest = Math.min(lowest, P.PREC_SHIFT_);
            i += 1;
          } else {
            lowest = Math.min(lowest, P.PREC_RELATIONAL_);
            if ('=' === next) {
              i += 1;
            }
          }
          break;
        case '>':
          if ('>' === next) {
            lowest = Math.min(lowest, P.PREC_SHIFT_);
            i += '>' === s.charAt(i + 2) ? 2 : 1;
          } else {
            lowest = Math.min(lowest, P.PREC_RELATIONAL_);
            if ('=' === next) {
              i += 1;
            }
          }
          break;
        case '+':
        case '-':
          if (!P.isUnaryPosition_(s, i)) {
            lowest = Math.min(lowest, P.PREC_ADDITIVE_);
          }
          break;
        case '*':
        case '/':
        case '%':
          lowest = Math.min(lowest, P.PREC_MULTIPLICATIVE_);
          break;
        default:
          break;
      }
    }

    return lowest;
  },

  /**
   * @param {string} expr
   * @param {number} requiredPrecedence
   * @param {boolean} allowEqual
   * @return {string}
   */
  wrap: function (expr, requiredPrecedence, allowEqual) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_} */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    var /** @const {number} */ actualPrecedence = P.topLevel(expr);

    if (
      P.isFullyParenthesized(expr) ||
      actualPrecedence > requiredPrecedence ||
      (allowEqual && actualPrecedence === requiredPrecedence)
    ) {
      return expr;
    }
    return '(' + expr + ')';
  },

  /**
   * @param {string} op
   * @param {string} expr
   * @return {string}
   */
  renderPrefix: function (op, expr) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_} */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    return op + P.wrap(expr, P.PREC_UNARY_, true);
  },

  /**
   * @param {string} L
   * @param {string} op
   * @param {string} R
   * @param {number} precedence
   * @param {boolean=} opt_allowRightEqual
   * @return {string}
   */
  renderInfix: function (L, op, R, precedence, opt_allowRightEqual) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_} */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    return P.wrap(L, precedence, true) + ' ' + op + ' ' + P.wrap(R, precedence, !!opt_allowRightEqual);
  },

  /**
   * @param {string} expr
   * @return {string}
   */
  formatCondition: function (expr) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_} */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    if ('' === expr) {
      return '(0)';
    }
    if (P.isFullyParenthesized(expr)) {
      return expr;
    }
    return '(' + expr + ')';
  },

  /**
   * Strips redundant outer parentheses from a fully-parenthesized expression.
   * Use when the expression will be placed inside a grouping context (function
   * call, cast operand, etc.) that already provides its own boundaries.
   *
   * @param {string} expr
   * @return {string}
   */
  stripOuter: function (expr) {
    var /** @const {!Wasm2Lang.Backend.AbstractCodegen.PrecedenceHelper_} */ P = Wasm2Lang.Backend.AbstractCodegen.Precedence_;
    return P.isFullyParenthesized(expr) ? expr.slice(1, -1) : expr;
  }
});

/**
 * Formats an expression for use as a boolean condition in control flow
 * (if, while, do-while).  Default delegates to the Precedence_ helper;
 * Java overrides to produce {@code (expr != 0)} form.
 *
 * @protected
 * @param {string} expr
 * @return {string}
 */
Wasm2Lang.Backend.AbstractCodegen.prototype.formatCondition_ = function (expr) {
  return Wasm2Lang.Backend.AbstractCodegen.Precedence_.formatCondition(expr);
};
