#!/usr/bin/env python3
"""
Парсер ECA данных из CSV в структурированный JSON
"""

import csv
import json
import re
from typing import Optional

def parse_year_groups(name: str) -> dict:
    """Извлекает возрастные группы из названия занятия"""
    result = {
        "min": None,
        "max": None,
        "labels": [],
        "raw": ""
    }
    
    # Паттерны для поиска возрастных групп
    patterns = [
        # "Years 1 to 6" или "Years 1 to 3"
        r'Years?\s+(\d+)\s+(?:to|&)\s+(\d+)',
        # "Year 1" (одиночный год)
        r'Year\s+(\d+)(?!\s*(?:to|&|\d))',
        # "Years 7 to 13"
        r'Years?\s+(\d+)\s+to\s+(\d+)',
        # "Early Years" 
        r'Early\s+Years',
        # "Reception"
        r'Reception',
        # "Preschool"
        r'Preschool',
    ]
    
    name_lower = name.lower()
    
    # Проверяем Early Years
    if 'early years' in name_lower:
        result["labels"].append("Early Years")
        result["min"] = 0
        result["max"] = 0
        
    # Проверяем Preschool
    if 'preschool' in name_lower:
        result["labels"].append("Preschool")
        if result["min"] is None:
            result["min"] = -1
            result["max"] = -1
    
    # Проверяем Reception
    if 'reception' in name_lower:
        result["labels"].append("Reception")
        if result["min"] is None or result["min"] > 0:
            result["min"] = 0
        if result["max"] is None or result["max"] < 0:
            result["max"] = 0
    
    # Ищем Years X to Y
    match = re.search(r'Years?\s+(\d+)\s+(?:to|&)\s+(\d+)', name, re.IGNORECASE)
    if match:
        year_min = int(match.group(1))
        year_max = int(match.group(2))
        if result["min"] is None or year_min < result["min"]:
            result["min"] = year_min
        if result["max"] is None or year_max > result["max"]:
            result["max"] = year_max
        for y in range(year_min, year_max + 1):
            label = f"Year {y}"
            if label not in result["labels"]:
                result["labels"].append(label)
    
    # Ищем одиночные Year X
    for match in re.finditer(r'Year\s+(\d+)(?!\s*(?:to|&|\d))', name, re.IGNORECASE):
        year = int(match.group(1))
        if result["min"] is None or year < result["min"]:
            result["min"] = year
        if result["max"] is None or year > result["max"]:
            result["max"] = year
        label = f"Year {year}"
        if label not in result["labels"]:
            result["labels"].append(label)
    
    # Ищем U9, U11, U13 и т.д. (возрастные категории для спорта)
    for match in re.finditer(r'U(\d+)', name):
        age = int(match.group(1))
        # Примерное соответствие возраста и года обучения
        # U9 ~ Year 3-4, U11 ~ Year 5-6, U13 ~ Year 7-8
        approx_year = max(1, age - 6)
        if result["min"] is None or approx_year < result["min"]:
            result["min"] = approx_year
        label = f"U{age}"
        if label not in result["labels"]:
            result["labels"].append(label)
    
    # Сортируем labels
    def sort_key(label):
        if label == "Preschool":
            return -2
        if label == "Early Years":
            return -1
        if label == "Reception":
            return 0
        match = re.search(r'(\d+)', label)
        if match:
            return int(match.group(1))
        return 100
    
    result["labels"] = sorted(result["labels"], key=sort_key)
    
    return result


def parse_days(day_str: str) -> list:
    """Парсит дни недели"""
    if not day_str or day_str == "#N/A":
        return []
    
    day_map = {
        'mon': 'Monday',
        'tue': 'Tuesday', 
        'wed': 'Wednesday',
        'thu': 'Thursday',
        'thur': 'Thursday',
        'fri': 'Friday',
        'sat': 'Saturday',
        'sun': 'Sunday',
        'monday': 'Monday',
        'tuesday': 'Tuesday',
        'wednesday': 'Wednesday',
        'thursday': 'Thursday',
        'friday': 'Friday',
        'saturday': 'Saturday',
        'sunday': 'Sunday',
    }
    
    days = []
    # Разбиваем по разделителям: /, &, and, ,
    parts = re.split(r'[/&,]|\band\b', day_str)
    
    for part in parts:
        part_clean = part.strip().lower()
        for key, value in day_map.items():
            if key in part_clean:
                if value not in days:
                    days.append(value)
                break
    
    # Сортируем по порядку дней недели
    day_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    days = sorted(days, key=lambda d: day_order.index(d) if d in day_order else 99)
    
    return days


def parse_time(time_str: str) -> dict:
    """Парсит время"""
    if not time_str or time_str == "#N/A":
        return {"start": None, "end": None, "raw": time_str}
    
    # Нормализуем разделители
    time_str = time_str.replace('–', '-').replace('—', '-').replace('.', ':')
    
    match = re.search(r'(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]\d{2})', time_str)
    if match:
        start = match.group(1).replace('.', ':')
        end = match.group(2).replace('.', ':')
        # Добавляем ведущий ноль если нужно
        if len(start.split(':')[0]) == 1:
            start = '0' + start
        if len(end.split(':')[0]) == 1:
            end = '0' + end
        return {"start": start, "end": end, "raw": time_str}
    
    return {"start": None, "end": None, "raw": time_str}


def parse_capacity(cap_str: str) -> dict:
    """Парсит мин-макс количество учеников"""
    if not cap_str or cap_str == "#N/A":
        return {"min": None, "max": None}
    
    # Убираем пробелы и нормализуем
    cap_str = cap_str.strip().replace(' ', '')
    
    match = re.search(r'(\d+)\s*[-–]\s*(\d+)', cap_str)
    if match:
        return {"min": int(match.group(1)), "max": int(match.group(2))}
    
    return {"min": None, "max": None}


def parse_fee(fee_str: str) -> tuple:
    """Парсит стоимость"""
    if not fee_str or fee_str == "#N/A":
        return 0, True
    
    # Убираем запятые и пробелы
    fee_str = fee_str.strip().replace(',', '').replace(' ', '')
    
    try:
        fee = int(float(fee_str))
        return fee, fee == 0
    except ValueError:
        return 0, True


def parse_teachers(teacher_str: str) -> list:
    """Парсит список учителей"""
    if not teacher_str or teacher_str == "#N/A":
        return []
    
    # Разделители: запятая, но не внутри скобок
    teachers = []
    current = ""
    paren_depth = 0
    
    for char in teacher_str:
        if char == '(':
            paren_depth += 1
            current += char
        elif char == ')':
            paren_depth -= 1
            current += char
        elif char == ',' and paren_depth == 0:
            if current.strip():
                teachers.append(current.strip())
            current = ""
        else:
            current += char
    
    if current.strip():
        teachers.append(current.strip())
    
    # Фильтруем пустые и очищаем
    teachers = [t.strip() for t in teachers if t.strip() and t.strip() != ""]
    
    return teachers


def determine_category(name: str, section: str) -> str:
    """Определяет категорию занятия"""
    name_lower = name.lower()
    section_lower = section.lower()
    
    # По секции
    if 'dance' in section_lower:
        return 'dance'
    if 'lamda' in section_lower:
        return 'lamda'
    if 'robotics' in section_lower:
        return 'robotics'
    if 'sport' in section_lower:
        return 'sports'
    if 'booster' in section_lower:
        return 'boosters'
    if 'vapp' in section_lower:
        return 'vapp'
    if 'aen' in section_lower or 'additional support' in section_lower:
        return 'aen'
    if 'eal' in section_lower or 'english as an additional' in section_lower:
        return 'eal'
    if 'academ' in section_lower:
        return 'academies'
    if 'club' in section_lower:
        return 'clubs'
    if 'foundation' in section_lower:
        return 'foundation'
    
    # По названию
    if 'dance' in name_lower or 'ballet' in name_lower or 'hip hop' in name_lower or 'jazz' in name_lower or 'cheer' in name_lower:
        return 'dance'
    if 'lamda' in name_lower:
        return 'lamda'
    if 'robot' in name_lower or 'bee-bot' in name_lower:
        return 'robotics'
    if 'coding' in name_lower or 'roblox' in name_lower or 'minecraft' in name_lower:
        return 'coding'
    if 'chess' in name_lower:
        return 'chess'
    if 'judo' in name_lower or 'jiu jitsu' in name_lower or 'martial' in name_lower:
        return 'martial_arts'
    if 'tennis' in name_lower:
        return 'tennis'
    if 'football' in name_lower or 'soccer' in name_lower:
        return 'football'
    if 'basketball' in name_lower:
        return 'basketball'
    if 'swimming' in name_lower or 'swim' in name_lower or 'aqua' in name_lower:
        return 'swimming'
    if 'booster' in name_lower:
        return 'boosters'
    if 'art' in name_lower:
        return 'art'
    if 'music' in name_lower or 'choir' in name_lower or 'orchestra' in name_lower or 'ukulele' in name_lower or 'guitar' in name_lower:
        return 'music'
    if 'science' in name_lower:
        return 'science'
    if 'thai' in name_lower:
        return 'thai'
    if 'mandarin' in name_lower or 'chinese' in name_lower:
        return 'mandarin'
    if 'french' in name_lower:
        return 'french'
    if 'russian' in name_lower:
        return 'russian'
    if 'lego' in name_lower:
        return 'lego'
    if 'book' in name_lower or 'story' in name_lower:
        return 'reading'
    
    return 'other'


def determine_level(name: str, section: str, year_groups: dict) -> str:
    """Определяет уровень (foundation/primary/secondary)"""
    name_lower = name.lower()
    section_lower = section.lower()
    
    # По секции
    if 'foundation' in section_lower:
        return 'foundation'
    if 'primary' in section_lower:
        return 'primary'
    if 'secondary' in section_lower:
        return 'secondary'
    
    # По названию
    if 'early years' in name_lower or 'preschool' in name_lower:
        return 'foundation'
    if 'reception' in name_lower:
        return 'foundation'
    
    # По годам обучения
    if year_groups["min"] is not None:
        if year_groups["min"] <= 0:
            return 'foundation'
        elif year_groups["min"] <= 6 and (year_groups["max"] is None or year_groups["max"] <= 6):
            return 'primary'
        elif year_groups["min"] >= 7:
            return 'secondary'
        else:
            # Смешанный - primary + secondary
            return 'mixed'
    
    return 'unknown'


def determine_provider(eca_id: str, section: str) -> str:
    """Определяет провайдера"""
    section_lower = section.lower()
    
    if 'outside provider' in section_lower:
        if 'cyberone' in section_lower or 'coding' in section_lower or 'roblox' in section_lower or 'minecraft' in section_lower or 'brain play' in section_lower:
            return 'cyberone'
        if 'tennis' in section_lower or 'dome' in section_lower:
            return 'dome_tennis'
        if 'judo' in section_lower:
            return 'judo_school'
        if 'jiu jitsu' in section_lower or 'martial' in section_lower:
            return 'ben_royle_bjj'
        if 'chess' in section_lower:
            return 'chess_club'
        if 'rush' in section_lower or 'flag football' in section_lower:
            return 'rush_sports'
        if 'formula' in section_lower or 'karting' in section_lower:
            return 'formula_fun'
        if 'table tennis' in section_lower:
            return 'phuket_table_tennis'
        if 'mind craft' in section_lower or 'maximise' in section_lower:
            return 'maximise_child_dev'
        return 'outside_provider'
    
    return 'headstart'


def is_invite_only(name: str) -> bool:
    """Проверяет, требуется ли приглашение"""
    return '*invite only' in name.lower() or 'invite only' in name.lower()


def clean_name(name: str) -> str:
    """Очищает название от служебных пометок"""
    # Убираем *Invite Only и подобное
    name = re.sub(r'\*?\s*Invite\s+Only\s*\*?', '', name, flags=re.IGNORECASE)
    # Убираем лишние пробелы
    name = ' '.join(name.split())
    return name.strip()


def parse_csv(filepath: str) -> list:
    """Главная функция парсинга CSV"""
    activities = []
    current_section = ""
    
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        
        for row in reader:
            if len(row) < 8:
                continue
            
            eca_id = row[0].strip() if row[0] else ""
            section_or_desc = row[1].strip() if len(row) > 1 else ""
            programme = row[2].strip() if len(row) > 2 else ""
            fee_str = row[3].strip() if len(row) > 3 else ""
            teacher = row[4].strip() if len(row) > 4 else ""
            day = row[5].strip() if len(row) > 5 else ""
            location = row[6].strip() if len(row) > 6 else ""
            time_str = row[7].strip() if len(row) > 7 else ""
            capacity_str = row[8].strip() if len(row) > 8 else ""
            
            # Пропускаем заголовки
            if programme.lower() in ['programme', 'headstart ecas:', ''] or programme.startswith('HeadStart ECAs:'):
                if section_or_desc:
                    current_section = section_or_desc
                if programme and 'HeadStart' in programme:
                    current_section = programme
                continue
            
            # Обновляем текущую секцию
            if section_or_desc and not eca_id:
                current_section = section_or_desc
                continue
            
            # Пропускаем строки без ID или с #N/A
            if not eca_id or programme == "#N/A" or not programme:
                if programme and 'HeadStart' in programme:
                    current_section = programme
                continue
            
            # Парсим данные
            fee, is_free = parse_fee(fee_str)
            year_groups = parse_year_groups(programme)
            days = parse_days(day)
            time_parsed = parse_time(time_str)
            capacity = parse_capacity(capacity_str)
            teachers = parse_teachers(teacher)
            category = determine_category(programme, current_section)
            level = determine_level(programme, current_section, year_groups)
            provider = determine_provider(eca_id, current_section)
            invite_only = is_invite_only(programme)
            clean_programme = clean_name(programme)
            
            activity = {
                "id": eca_id.strip(),
                "name": clean_programme,
                "nameOriginal": programme,
                "category": category,
                "level": level,
                "fee": fee,
                "isFree": is_free,
                "yearGroups": year_groups,
                "schedule": {
                    "days": days,
                    "time": time_parsed
                },
                "location": location if location != "#N/A" else "",
                "teachers": teachers,
                "capacity": capacity,
                "inviteOnly": invite_only,
                "provider": provider,
                "section": current_section
            }
            
            activities.append(activity)
    
    return activities


def main():
    import os
    
    # Путь к CSV файлу
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(script_dir, 'eca_data.csv')
    json_path = os.path.join(script_dir, 'eca_data.json')
    
    print(f"📖 Читаю CSV: {csv_path}")
    activities = parse_csv(csv_path)
    
    print(f"✅ Распарсено занятий: {len(activities)}")
    
    # Удаляем дубликаты по ID
    seen_ids = set()
    unique_activities = []
    duplicates = 0
    for act in activities:
        if act['id'] not in seen_ids:
            seen_ids.add(act['id'])
            unique_activities.append(act)
        else:
            duplicates += 1
    
    activities = unique_activities
    print(f"🔄 Удалено дубликатов: {duplicates}")
    print(f"📊 Уникальных занятий: {len(activities)}")
    
    # Статистика
    categories = {}
    levels = {}
    free_count = 0
    paid_count = 0
    
    for act in activities:
        cat = act["category"]
        categories[cat] = categories.get(cat, 0) + 1
        
        lvl = act["level"]
        levels[lvl] = levels.get(lvl, 0) + 1
        
        if act["isFree"]:
            free_count += 1
        else:
            paid_count += 1
    
    print(f"\n📊 Статистика:")
    print(f"   Бесплатных: {free_count}")
    print(f"   Платных: {paid_count}")
    
    print(f"\n📁 По категориям:")
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"   {cat}: {count}")
    
    print(f"\n🎓 По уровням:")
    for lvl, count in sorted(levels.items(), key=lambda x: -x[1]):
        print(f"   {lvl}: {count}")
    
    # Сохраняем JSON
    output = {
        "meta": {
            "source": "HeadStart ECA Chaofah City Campus",
            "term": "Term 2&3 2025-2026",
            "totalActivities": len(activities),
            "freeActivities": free_count,
            "paidActivities": paid_count
        },
        "categories": {
            "clubs": "Клубы",
            "sports": "Спорт",
            "football": "Футбол",
            "basketball": "Баскетбол",
            "swimming": "Плавание",
            "tennis": "Теннис",
            "martial_arts": "Боевые искусства",
            "boosters": "Дополнительные занятия",
            "vapp": "Программы для одарённых",
            "aen": "Дополнительная поддержка",
            "eal": "Английский как доп. язык",
            "academies": "Академии",
            "dance": "Танцы",
            "lamda": "LAMDA (драма/речь)",
            "music": "Музыка",
            "art": "Искусство",
            "science": "Наука",
            "coding": "Программирование",
            "robotics": "Робототехника",
            "chess": "Шахматы",
            "lego": "Лего",
            "reading": "Чтение",
            "thai": "Тайский язык",
            "mandarin": "Китайский язык",
            "french": "Французский язык",
            "russian": "Русский язык",
            "foundation": "Занятия для дошкольников",
            "other": "Другое"
        },
        "levels": {
            "foundation": "Foundation (Early Years, Reception)",
            "primary": "Primary (Years 1-6)",
            "secondary": "Secondary (Years 7-13)",
            "mixed": "Смешанный"
        },
        "activities": activities
    }
    
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 Сохранено в: {json_path}")
    
    # Показываем примеры
    print(f"\n📝 Примеры распарсенных занятий:")
    for act in activities[:3]:
        print(f"\n   {act['name']}")
        print(f"   ID: {act['id']}, Категория: {act['category']}, Уровень: {act['level']}")
        print(f"   Дни: {act['schedule']['days']}, Время: {act['schedule']['time']['start']}-{act['schedule']['time']['end']}")
        print(f"   Классы: {act['yearGroups']['labels']}")
        fee_text = "Да" if act['isFree'] else f"Нет ({act['fee']} THB)"
        print(f"   Бесплатно: {fee_text}")


if __name__ == "__main__":
    main()

