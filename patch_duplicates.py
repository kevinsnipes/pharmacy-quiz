import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PACKS = ROOT / "_packs"

REPLACEMENTS = {
    "p0065": {
        "question": "Which cited work is Schrödinger’s 1944 inquiry into the physical basis of living systems?",
        "choices": [
            {"id": "A", "text": "Introduction to Nutrition and Metabolism"},
            {"id": "B", "text": "Textbook of Biochemistry with Clinical Correlations"},
            {"id": "C", "text": "What Is Life?"},
            {"id": "D", "text": "The Molecular Basis of Blood Diseases"},
        ],
        "correct": "C",
        "sourceQuote": "Schrödinger E. What Is Life? Cambridge",
        "explanationCorrect": "The biochemistry chapter bibliography lists Schrödinger’s What Is Life? (Cambridge University Press, 1944).",
        "explanationWrong": {
            "A": "That title is Bender’s nutrition and metabolism text, not Schrödinger.",
            "B": "That title is Devlin’s biochemistry textbook.",
            "D": "That title is Stamatoyannopoulos and colleagues’ blood-diseases text.",
        },
    },
    "p0642": {
        "question": "In this review’s answer key, stage 1 hypertension is defined as which blood-pressure range?",
        "choices": [
            {"id": "A", "text": "Systolic 120–129 mm Hg with diastolic <80 mm Hg"},
            {"id": "B", "text": "Systolic 130–139 mm Hg or diastolic 80–89 mm Hg"},
            {"id": "C", "text": "Systolic ≥140 mm Hg or diastolic ≥90 mm Hg"},
            {"id": "D", "text": "Systolic ≥180 mm Hg regardless of diastolic value"},
        ],
        "correct": "B",
        "sourceQuote": "Stage 1 hypertension is defined as a systolic blood pressure of 130",
        "explanationCorrect": "The key states stage 1 hypertension is systolic 130–139 mm Hg or diastolic 80–89 mm Hg.",
        "explanationWrong": {
            "A": "That pattern is elevated blood pressure, not the stage 1 range given here.",
            "C": "That is a higher-stage threshold, not the stage 1 definition in this key.",
            "D": "That describes hypertensive crisis-range systolic values, not stage 1.",
        },
    },
    "p0663": {
        "question": "Which of the following is identified as not an open-ended question?",
        "choices": [
            {"id": "A", "text": "How do you feel?"},
            {"id": "B", "text": "What symptoms do you have?"},
            {"id": "C", "text": "When do you experience pain?"},
            {"id": "D", "text": "Do you have a neurological disorder?"},
        ],
        "correct": "D",
        "sourceQuote": "Which of the following is not an open-ended question",
        "explanationCorrect": "The item keys “Do you have a neurological disorder?” as not open-ended because it can be answered yes/no.",
        "explanationWrong": {
            "A": "“How do you feel?” is listed among open-ended prompts.",
            "B": "“What symptoms do you have?” invites a narrative, not a yes/no answer.",
            "C": "“When do you experience pain?” is open-ended timing inquiry.",
        },
    },
    "p0746": {
        "question": "When projecting demand, merchandising and manufacturing pharmacies are described as relying on which input?",
        "choices": [
            {"id": "A", "text": "Patient acuity levels and hospital census"},
            {"id": "B", "text": "Projected sales of their goods"},
            {"id": "C", "text": "Website visits and capture rate of purchases"},
            {"id": "D", "text": "Only last year’s industry-wide prescription volume"},
        ],
        "correct": "B",
        "sourceQuote": "Merchandising and manufacturing pharmacies project sales of their goods",
        "explanationCorrect": "The passage states merchandising and manufacturing pharmacies project sales of their goods when forecasting.",
        "explanationWrong": {
            "A": "Acuity and census are what hospital pharmacies review.",
            "C": "Website visits and capture rate are described for online and mail-order pharmacies.",
            "D": "The text lists several forecasting factors, not a single prior-year industry volume.",
        },
    },
    "p0756": {
        "question": "Among listed health-system pharmacy executive responsibilities is which of the following?",
        "choices": [
            {"id": "A", "text": "Fulfilling the organization’s research and educational missions"},
            {"id": "B", "text": "Independently setting federal compounding statutes"},
            {"id": "C", "text": "Serving as the sole payer for all outpatient claims"},
            {"id": "D", "text": "Replacing the medical staff executive committee"},
        ],
        "correct": "A",
        "sourceQuote": "Fulfilling the organization’s research and educational missions",
        "explanationCorrect": "Box 17-1 includes fulfilling the organization’s research and educational missions among executive responsibilities.",
        "explanationWrong": {
            "B": "Executives ensure regulatory compliance; they do not write federal compounding statutes.",
            "C": "Payer functions are not listed as a pharmacy executive duty here.",
            "D": "Institutional representation is listed, not replacement of the medical staff committee.",
        },
    },
    "p0786": {
        "question": "Adverse drug effects and medication errors should be reported to which FDA resource named in this passage?",
        "choices": [
            {"id": "A", "text": "The Orange Book website"},
            {"id": "B", "text": "The FDA MedWatch Web site"},
            {"id": "C", "text": "The National Drug Code Directory only"},
            {"id": "D", "text": "The REMS dashboard exclusively"},
        ],
        "correct": "B",
        "sourceQuote": "Adverse drug effects and medication errors should be reported to the FDA MedWatch Web site",
        "explanationCorrect": "The passage directs reporting of adverse drug effects and medication errors to the FDA MedWatch website, after which they enter FAERS.",
        "explanationWrong": {
            "A": "The Orange Book is not the reporting portal described here.",
            "C": "NDC listing is not the adverse-event reporting channel named.",
            "D": "REMS is not identified as the reporting site in this paragraph.",
        },
    },
    "p0846": {
        "question": "If the President or a governor vetoes a bill, what may the legislature do according to this chapter?",
        "choices": [
            {"id": "A", "text": "Nothing; a veto is final in all cases"},
            {"id": "B", "text": "Vote to override the veto"},
            {"id": "C", "text": "Convert the bill into a regulation automatically"},
            {"id": "D", "text": "Require a treaty to enact the bill"},
        ],
        "correct": "B",
        "sourceQuote": "If a veto occurs, the legislature may vote to override the veto",
        "explanationCorrect": "After a presidential or gubernatorial veto, the legislature may vote to override it.",
        "explanationWrong": {
            "A": "The passage explicitly allows a legislative override.",
            "C": "Regulations are promulgated by agencies, not created by converting a vetoed bill.",
            "D": "Treaties are a different, superior legal category; they are not required to enact a statute after veto.",
        },
    },
    "p0860": {
        "question": "As of 2017 in this chapter’s account, physician-assisted suicide for terminally ill patients was legal in how many states plus the District of Columbia?",
        "choices": [
            {"id": "A", "text": "Two states only, and not the District of Columbia"},
            {"id": "B", "text": "All fifty states"},
            {"id": "C", "text": "Six states and the District of Columbia"},
            {"id": "D", "text": "The federal system exclusively, with no state laws"},
        ],
        "correct": "C",
        "sourceQuote": "physician-assisted suicide for terminally ill patients is legal in six states and the District of Columbia",
        "explanationCorrect": "The chapter states that as of 2017, physician-assisted suicide for terminally ill patients is legal in six states and D.C.",
        "explanationWrong": {
            "A": "The count given is six states plus D.C., not two states without D.C.",
            "B": "It is not described as legal nationwide.",
            "D": "The legalization described is state (and D.C.) law, not a sole federal regime.",
        },
    },
    "p0886": {
        "question": "Semi-integrated delivery models in this chapter are characterized by which arrangement?",
        "choices": [
            {"id": "A", "text": "Every hospital, physician, and pharmacy is employed by one organization"},
            {"id": "B", "text": "Independent entities contract with an HMO plan to deliver care"},
            {"id": "C", "text": "Care is limited to a single closed staff-model clinic with no contracts"},
            {"id": "D", "text": "Payers are prohibited from coordinating among independent providers"},
        ],
        "correct": "B",
        "sourceQuote": "These semi-integrated models may include several independent entities who contract with an HMO plan to deliver care",
        "explanationCorrect": "Semi-integrated models may include independent entities that contract with an HMO to coordinate services without shared employment.",
        "explanationWrong": {
            "A": "That describes a fully vertically integrated employment model, which the passage contrasts with semi-integrated arrangements.",
            "C": "The text describes multiple independent contractors, not a single closed clinic with no contracts.",
            "D": "The point of the model is coordination among independent members, not a ban on it.",
        },
    },
    "p0908": {
        "question": "Low-affinity Fc receptors (FcRII) discussed in this immunology section are present primarily on which cells?",
        "choices": [
            {"id": "A", "text": "Mast cells and basophils only"},
            {"id": "B", "text": "Most leukocytes"},
            {"id": "C", "text": "Mature erythrocytes exclusively"},
            {"id": "D", "text": "Platelets and megakaryocytes only"},
        ],
        "correct": "B",
        "sourceQuote": "the low-affinity receptor is present on most leukocytes",
        "explanationCorrect": "FcRII, the low-affinity receptor, is present on most leukocytes, in contrast to high-affinity FcRI on mast cells and basophils.",
        "explanationWrong": {
            "A": "Mast cells and basophils are the primary sites of the high-affinity receptor FcRI.",
            "C": "Erythrocytes are not identified as the FcRII distribution here.",
            "D": "Platelets/megakaryocytes are not the primary FcRII distribution given in this passage.",
        },
    },
}


def main() -> None:
    for path in sorted(PACKS.glob("out_*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        changed = False
        for i, q in enumerate(data):
            rid = q.get("id")
            if rid not in REPLACEMENTS:
                continue
            patch = REPLACEMENTS[rid]
            data[i] = {**q, **patch}
            changed = True
        if changed:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            print("patched", path.name)


if __name__ == "__main__":
    main()
