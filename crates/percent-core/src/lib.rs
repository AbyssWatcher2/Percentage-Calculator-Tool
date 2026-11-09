//! Pure percentage calculation helpers.
//!
//! Kept free of any UI or Tauri dependency so the formulas can be unit-tested
//! on their own (`cargo test -p percent-core`) and verified byte-for-byte
//! against the original v1.1 JavaScript implementation.

use serde::Serialize;

/// Outcome of a single-value percentage calculation.
///
/// Serializes to the same JSON shape the v1.1 renderer used (`{ ok, value, label }`
/// or `{ ok: false, error }`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "ok")]
pub enum CalcResult {
    #[serde(rename = "true")]
    Ok {
        value: f64,
        label: String,
        /// Extra formatted text used by the Percentage Change live-result line
        /// (`"{abs}% increase|decrease|no change"`). Matches `label` for all
        /// other calculators.
        #[serde(rename = "liveResult")]
        live_result: String,
    },
    #[serde(rename = "false")]
    Err { error: &'static str },
}

/// Outcome of the Discount calculator, which produces two numbers (final price
/// and amount saved) plus two formatted lines.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DiscountResult {
    pub ok: bool,
    #[serde(rename = "finalPrice")]
    pub final_price: f64,
    pub saved: f64,
    #[serde(rename = "finalText")]
    pub final_text: String,
    #[serde(rename = "savedText")]
    pub saved_text: String,
    pub label: String,
    #[serde(rename = "copyText")]
    pub copy_text: String,
}

/// JavaScript-identical `Math.round(x)`:
/// ties (`.5`) round toward `+∞` (`js_round(-2.5) == -2.0`), whereas Rust's
/// `f64::round` rounds ties away from zero (`(-2.5_f64).round() == -3.0`).
#[inline]
pub fn js_round(x: f64) -> f64 {
    if !x.is_finite() || x == 0.0 {
        return x;
    }
    // In [-0.5, 0), Math.round returns -0 (which formats as "0.00").
    if (-0.5..0.0).contains(&x) {
        return -0.0;
    }
    // Above 2^52 every f64 is already an integer, and `x + 0.5` could double-round.
    if x.abs() >= 4_503_599_627_370_496.0 {
        return x;
    }
    (x + 0.5).floor()
}

/// Formats a number to two decimal places using the exact same steps as the
/// v1.1 JS `formatDecimal`:
/// `const rounded = Math.round(value * 100) / 100; return rounded.toFixed(2);`
pub fn format_decimal(value: f64) -> String {
    if value.is_nan() {
        return "?".to_string();
    }
    let rounded = js_round(value * 100.0) / 100.0;
    if !rounded.is_finite() {
        return if rounded.is_sign_negative() {
            "-Infinity".to_string()
        } else {
            "Infinity".to_string()
        };
    }
    // Normalise -0.0 so `format!("{:.2}", -0.0)` never emits "-0.00".
    let clean = if rounded == 0.0 { 0.0 } else { rounded };
    // Match JS `Number.prototype.toFixed(2)` switching to exponential notation
    // at 1e21.
    if clean.abs() >= 1e21 {
        return js_exponential(clean);
    }
    js_to_fixed_2(clean)
}

/// Matches ECMAScript `Number.prototype.toFixed(2)`: rounds the exact decimal
/// representation of the `f64` to 2 fractional digits with ties rounded away
/// from zero (whereas Rust's `format!("{:.2}")` rounds ties to even).
fn js_to_fixed_2(x: f64) -> String {
    let scaled8 = x.abs() * 8.0;
    if scaled8 < (u64::MAX as f64) && scaled8.fract() == 0.0 {
        let k = scaled8 as u128;
        if k % 2 == 1 {
            // Exact value is k / 8 = (k * 125) / 1000. Adding 5 rounds the
            // thousandths digit (always 5 for odd k) away from zero.
            let sign = if x.is_sign_negative() { "-" } else { "" };
            let cents = (k * 125 + 5) / 10;
            return format!("{sign}{}.{:02}", cents / 100, cents % 100);
        }
    }
    format!("{x:.2}")
}

fn js_exponential(x: f64) -> String {
    let sign = if x.is_sign_negative() { "-" } else { "" };
    let s = format!("{:e}", x.abs());
    let (mantissa, exp) = s.split_once('e').expect("scientific notation");
    let exp_num: i32 = exp.parse().expect("exponent");
    let exp_sign = if exp_num >= 0 { '+' } else { '-' };
    format!("{sign}{mantissa}e{exp_sign}{}", exp_num.unsigned_abs())
}

/// Percentage change from `original_value` to `new_value`:
/// `((new - original) / original) * 100`.
pub fn calculate_percentage_change(original_value: f64, new_value: f64) -> CalcResult {
    if original_value == 0.0 {
        return CalcResult::Err {
            error: "Original value cannot be zero",
        };
    }

    let value = ((new_value - original_value) / original_value) * 100.0;
    let abs_text = format_decimal(value.abs());

    let suffix = if value > 0.0 {
        "increase"
    } else if value < 0.0 {
        "decrease"
    } else {
        "no change"
    };

    let label = if value != 0.0 && !value.is_nan() {
        format!("{abs_text}% {suffix}")
    } else {
        "0.00% no change".to_string()
    };
    let live_result = format!("{abs_text}% {suffix}");

    CalcResult::Ok {
        value,
        label,
        live_result,
    }
}

/// What percentage `part` is of `total`: `(part / total) * 100`.
pub fn calculate_percentage_of_total(part: f64, total: f64) -> CalcResult {
    if total == 0.0 {
        return CalcResult::Err {
            error: "Total cannot be zero",
        };
    }

    let value = (part / total) * 100.0;
    let label = format!("{}%", format_decimal(value));
    CalcResult::Ok {
        value,
        live_result: label.clone(),
        label,
    }
}

/// `percent`% of `number`: `(percent / 100) * number`.
pub fn calculate_percentage_portion(percent: f64, number: f64) -> CalcResult {
    let value = (percent / 100.0) * number;
    let label = format_decimal(value);
    CalcResult::Ok {
        value,
        live_result: label.clone(),
        label,
    }
}

/// Final price and amount saved after applying `discount_percent`% to `price`.
pub fn calculate_discount(price: f64, discount_percent: f64) -> DiscountResult {
    let saved = price * (discount_percent / 100.0);
    let final_price = price - saved;
    let final_text = format_decimal(final_price);
    let saved_text = format_decimal(saved);
    let label = format!("Final: {final_text}<br>Saved: {saved_text}");
    let copy_text = format!("Final: {final_text}\nSaved: {saved_text}");

    DiscountResult {
        ok: true,
        final_price,
        saved,
        final_text,
        saved_text,
        label,
        copy_text,
    }
}

/// Finds the full value when `value` is `percent`% of it: `value / (percent / 100)`.
pub fn calculate_original_value(value: f64, percent: f64) -> CalcResult {
    if percent == 0.0 {
        return CalcResult::Err {
            error: "Percent cannot be zero",
        };
    }

    let original_value = value / (percent / 100.0);
    let label = format_decimal(original_value);
    CalcResult::Ok {
        value: original_value,
        live_result: label.clone(),
        label,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- Direct port of tests/calculations.test.js (Vitest) ---

    #[test]
    fn format_decimal_two_places() {
        assert_eq!(format_decimal(25.0), "25.00");
        assert_eq!(format_decimal(12.345), "12.35");
        assert_eq!(format_decimal(f64::NAN), "?");
    }

    #[test]
    fn js_rounding_ties_toward_pos_infinity() {
        // -2.5 rounds to -2 in JS Math.round (not -3 as in f64::round).
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(format_decimal(-0.025), "-0.02");
        assert_eq!(format_decimal(0.025), "0.03");
        assert_eq!(format_decimal(-0.001), "0.00");
    }

    #[test]
    fn percentage_change_increase_decrease_zero() {
        assert_eq!(
            calculate_percentage_change(150.0, 180.0),
            CalcResult::Ok {
                value: 20.0,
                label: "20.00% increase".into(),
                live_result: "20.00% increase".into(),
            }
        );
        assert_eq!(
            calculate_percentage_change(200.0, 150.0),
            CalcResult::Ok {
                value: -25.0,
                label: "25.00% decrease".into(),
                live_result: "25.00% decrease".into(),
            }
        );
        assert_eq!(
            calculate_percentage_change(100.0, 100.0),
            CalcResult::Ok {
                value: 0.0,
                label: "0.00% no change".into(),
                live_result: "0.00% no change".into(),
            }
        );
        assert_eq!(
            calculate_percentage_change(0.0, 150.0),
            CalcResult::Err {
                error: "Original value cannot be zero"
            }
        );
    }

    #[test]
    fn percentage_of_total_works_and_rejects_zero() {
        assert_eq!(
            calculate_percentage_of_total(50.0, 200.0),
            CalcResult::Ok {
                value: 25.0,
                label: "25.00%".into(),
                live_result: "25.00%".into(),
            }
        );
        assert_eq!(
            calculate_percentage_of_total(50.0, 0.0),
            CalcResult::Err {
                error: "Total cannot be zero"
            }
        );
    }

    #[test]
    fn percentage_portion_works() {
        assert_eq!(
            calculate_percentage_portion(20.0, 500.0),
            CalcResult::Ok {
                value: 100.0,
                label: "100.00".into(),
                live_result: "100.00".into(),
            }
        );
    }

    #[test]
    fn discount_final_and_saved() {
        let r = calculate_discount(79.99, 20.0);
        assert!(r.ok);
        assert!((r.final_price - 63.992).abs() < 1e-9);
        assert!((r.saved - 15.998).abs() < 1e-9);
        assert_eq!(r.final_text, "63.99");
        assert_eq!(r.saved_text, "16.00");
        assert_eq!(r.label, "Final: 63.99<br>Saved: 16.00");
        assert_eq!(r.copy_text, "Final: 63.99\nSaved: 16.00");
    }

    #[test]
    fn original_value_works_and_rejects_zero() {
        assert_eq!(
            calculate_original_value(50.0, 25.0),
            CalcResult::Ok {
                value: 200.0,
                label: "200.00".into(),
                live_result: "200.00".into(),
            }
        );
        assert_eq!(
            calculate_original_value(50.0, 0.0),
            CalcResult::Err {
                error: "Percent cannot be zero"
            }
        );
    }
}
