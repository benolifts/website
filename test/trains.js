
const list_of_trains = [
    {
        name: "UK Class 323",
        description: "A classic Uk EMU known for its awesome Holec VF drive",
        preferedVF: ["Holec (90 mph)"],
        preferedLivery: ["Regional_Railways"],
        preferedNumberOfCoaches: 3,
        scripts: {
            train_config() {

                globalThis.traindoors = [[0.248, true, true, true ,true, 1.7, 0, 2],[0.75, true, true, true ,true, 1.7, 0, 2]];  // [[door-z, front_coach, middle_coach, rear_coach, railbus, door-width, door_type, door_direction]]
                                            //   Door-z is the position in the coach the door is to be added.  Position is based on the coach position before overhangs are added.  Between 0 and 1 as percentage of train length.
                                            //   front_coach is boolean of if the door will be placed on the first coach
                                            //   middle_coach is boolean of if the door will be placed on any non front and non rear coaches
                                            //   rear_coach is boolean of if the door will be placed on the last coach
                                            //   railbus is boolean of if the door will be placed on a single coach train
                                            //   door-width is width of doors (total width of door section, so if double doors then the doors are half this).  (and door thickness is hard set at 0.07)
                                            //   door-type is as follows.   door-type is as follows.   0 is plug doors which sit flush to the train and pop out slightly and slide.  1 is outside sliding doors, which sit on outside of train and slide.  2 is inset sliding doors.    3 is bus style swing doors that open inwards.   4 is slam doors which fold outwards
                                            //   door_direction is which way the doors open.  0 is door that opens in forwads direction, 1 is door that opens in rear directing, and 2 is 2 doors, one opening forwards and one opening backwards

                globalThis.train_floor_height = 1.15;
                globalThis.train_roof_height = 3.6;
                globalThis.train_doortop_percentage = 0.8;
                globalThis.train_body_dimentions = [[0.9,0],[0.96,1-0.93],[0.99,1-0.87],[1,1-0.82],[1,1-0.7],[0.98,1-0.6],[0.93,1-0.2],[0.89,1-0.16],[0.85,1-0.13],[0.6,1-0.06],[0.3, 1-0.018],[0,1]];  //
                //globalThis.train_body_dimentions = [[1,0],[1,0.4],[0.7,0.8],[0,1]];  //  List of x y co-ords of the train body running lengthwise down the train.
                globalThis.door_speed = 3;  // Time it trakes to open and close doors
                globalThis.door_alarm = 3;  // Time to sound alarm before doors shut
                globalThis.Jacobs_bogies = false; // true means its like a tram where coaches sit between bogies.  False means regukar train bogies.
                globalThis.trains_bogies_percentage = 70;  //  For non Jacobs bogies only. Value of how far the trains bogies are down the coach.  100 means they are at the very ends and overlapping next coach, and 0 means they are in the very middle.  So 50 is a normal value.
                globalThis.coachlength = 21;
                globalThis.cab_overhang = 1.6;  // On the very front and rear how much longer should the coach be.  This is important for Jacobs_bogies.
                globalThis.non_cab_overhang = -0.3;  // how huch should the non cab end of coaches overhang.  set to -0.5 for normal trains.
                globalThis.gangways = true;    //  If there are gangways between coaches
                globalThis.livery_includes_cab = false;    //  Does the livery affect the cab.  If true it needs textures for it.
                globalThis.cab3d = [];

                globalThis.roundDepth = 0.1;  //  Smoothing for flat train front, if a 3d cab is not used for the train then this must be set
                globalThis.roundWidth = 0.1;  //  Smoothing for flat train front, if a 3d cab is not used for the train then this must be set



                globalThis.train_use_bogies = true;
                globalThis.train_use_body = true;


                globalThis.trainWidth = 2.8;
                globalThis.bogie_proportions = 1.9;  // How many times longer is the bogie in z direction compared to track gauge
                globalThis.bogie_height = 1;



                globalThis.EYE_HEIGHT = 2;  // the view eye height
                globalThis.cameraXOffset = -0.5;  // camera offset for train cab

            }
        }
    },












{
    name: "UK Class 395",
    description: "A classic Uk EMU known for its awesome Holec VF drive",
    preferedVF: ["Hitachi High Speed"],
    preferedLivery: ["Blue"],
    preferedNumberOfCoaches: 3,
    scripts: {
        train_config() {

            globalThis.traindoors = [[0.258, true, true, true ,true, 1.2, 2, 0],[0.74, true, true, true ,true, 1.2, 2, 1]];  // [[door-z, front_coach, middle_coach, rear_coach, railbus, door-width, door_type, door_direction]]
            //   Door-z is the position in the coach the door is to be added.  Position is based on the coach position before overhangs are added.  Between 0 and 1 as percentage of train length.
            //   front_coach is boolean of if the door will be placed on the first coach
            //   middle_coach is boolean of if the door will be placed on any non front and non rear coaches
            //   rear_coach is boolean of if the door will be placed on the last coach
            //   railbus is boolean of if the door will be placed on a single coach train
            //   door-width is width of doors (total width of door section, so if double doors then the doors are half this).  (and door thickness is hard set at 0.07)
            //   door-type is as follows.   door-type is as follows.   0 is plug doors which sit flush to the train and pop out slightly and slide.  1 is outside sliding doors, which sit on outside of train and slide.  2 is inset sliding doors.    3 is bus style swing doors that open inwards.   4 is slam doors which fold outwards
            //   door_direction is which way the doors open.  0 is door that opens in forwads direction, 1 is door that opens in rear directing, and 2 is 2 doors, one opening forwards and one opening backwards

            globalThis.train_floor_height = 1.15;
            globalThis.train_roof_height = 3.6;
            globalThis.train_doortop_percentage = 0.8;
            globalThis.train_body_dimentions = [[0.9,0],[0.96,1-0.93],[0.99,1-0.87],[1,1-0.82],[1,1-0.7],[0.98,1-0.6],[0.93,1-0.2],[0.89,1-0.16],[0.85,1-0.13],[0.6,1-0.06],[0.3, 1-0.018],[0,1]];  //
            //globalThis.train_body_dimentions = [[1,0],[1,0.4],[0.7,0.8],[0,1]];  //  List of x y co-ords of the train body running lengthwise down the train.
            globalThis.door_speed = 3;  // Time it trakes to open and close doors
            globalThis.door_alarm = 3;  // Time to sound alarm before doors shut
            globalThis.Jacobs_bogies = false; // true means its like a tram where coaches sit between bogies.  False means regukar train bogies.
            globalThis.trains_bogies_percentage = 60;  //  For non Jacobs bogies only. Value of how far the trains bogies are down the coach.  100 means they are at the very ends and overlapping next coach, and 0 means they are in the very middle.  So 50 is a normal value.
            globalThis.coachlength = 19;
            globalThis.cab_overhang = -2.8;  // On the very front and rear how much longer should the coach be.  This is important for Jacobs_bogies.
            globalThis.non_cab_overhang = -0.3;  // how huch should the non cab end of coaches overhang.  set to -0.5 for normal trains.
            globalThis.gangways = true;    //  If there are gangways between coaches
            globalThis.livery_includes_cab = false;    //  Does the livery affect the cab.  If true it needs textures for it.
            //globalThis.cab3d = [];

            globalThis.roundDepth = 0.1;  //  Smoothing for flat train front, if a 3d cab is not used for the train then this must be set
            globalThis.roundWidth = 0.1;  //  Smoothing for flat train front, if a 3d cab is not used for the train then this must be set



            globalThis.cab3d = [

                // Row 1 — centre 0.30m
                [0.07, 0.12, 0.18, 0.23, 0.27, 0.29, 0.30, 0.30, 0.30, 0.30, 0.30, 0.30, 0.30, 0.30, 0.29, 0.27, 0.23, 0.18, 0.12, 0.07],

                // Row 2 — centre 0.60m
                [0.15, 0.24, 0.36, 0.46, 0.54, 0.58, 0.60, 0.60, 0.60, 0.60, 0.60, 0.60, 0.60, 0.60, 0.58, 0.54, 0.46, 0.36, 0.24, 0.15],

                // Row 3
                [0.21, 0.34, 0.50, 0.64, 0.75, 0.81, 0.84, 0.84, 0.84, 0.84, 0.84, 0.84, 0.84, 0.84, 0.81, 0.75, 0.64, 0.50, 0.34, 0.21],

                // Row 4
                [0.27, 0.43, 0.64, 0.83, 0.97, 1.04, 1.08, 1.09, 1.09, 1.09, 1.09, 1.09, 1.09, 1.08, 1.04, 0.97, 0.83, 0.64, 0.43, 0.27],

                // Row 5
                [0.33, 0.53, 0.79, 1.01, 1.19, 1.28, 1.32, 1.33, 1.33, 1.33, 1.33, 1.33, 1.33, 1.32, 1.28, 1.19, 1.01, 0.79, 0.53, 0.33],

                // Row 6
                [0.39, 0.63, 0.93, 1.20, 1.41, 1.51, 1.56, 1.57, 1.57, 1.57, 1.57, 1.57, 1.57, 1.56, 1.51, 1.41, 1.20, 0.93, 0.63, 0.39],

                // Row 7
                [0.45, 0.73, 1.07, 1.38, 1.62, 1.75, 1.80, 1.81, 1.81, 1.81, 1.81, 1.81, 1.81, 1.80, 1.75, 1.62, 1.38, 1.07, 0.73, 0.45],

                // Row 8
                [0.51, 0.82, 1.22, 1.57, 1.84, 1.98, 2.04, 2.06, 2.06, 2.06, 2.06, 2.06, 2.06, 2.04, 1.98, 1.84, 1.57, 1.22, 0.82, 0.51],

                // Row 9
                [0.57, 0.92, 1.36, 1.75, 2.06, 2.21, 2.28, 2.30, 2.30, 2.30, 2.30, 2.30, 2.30, 2.28, 2.21, 2.06, 1.75, 1.36, 0.92, 0.57],

                // Row 10
                [0.64, 1.02, 1.51, 1.94, 2.28, 2.45, 2.52, 2.54, 2.54, 2.54, 2.54, 2.54, 2.54, 2.52, 2.45, 2.28, 1.94, 1.51, 1.02, 0.64],

                // Row 11
                [0.70, 1.11, 1.65, 2.12, 2.49, 2.68, 2.76, 2.79, 2.79, 2.79, 2.79, 2.79, 2.79, 2.76, 2.68, 2.49, 2.12, 1.65, 1.11, 0.70],

                // Row 12
                [0.76, 1.21, 1.79, 2.31, 2.71, 2.92, 3.01, 3.03, 3.03, 3.03, 3.03, 3.03, 3.03, 3.01, 2.92, 2.71, 2.31, 1.79, 1.21, 0.76],

                // Row 13
                [0.82, 1.31, 1.94, 2.49, 2.93, 3.15, 3.25, 3.27, 3.27, 3.27, 3.27, 3.27, 3.27, 3.25, 3.15, 2.93, 2.49, 1.94, 1.31, 0.82],

                // Row 14
                [0.88, 1.41, 2.08, 2.68, 3.15, 3.38, 3.49, 3.51, 3.51, 3.51, 3.51, 3.51, 3.51, 3.49, 3.38, 3.15, 2.68, 2.08, 1.41, 0.88],

                // Row 15
                [0.94, 1.50, 2.23, 2.86, 3.36, 3.62, 3.73, 3.76, 3.76, 3.76, 3.76, 3.76, 3.76, 3.73, 3.62, 3.36, 2.86, 2.23, 1.50, 0.94],

                // Row 16 — rounded nose maximum
                [1.00, 1.60, 2.37, 3.05, 3.58, 3.85, 3.97, 4.00, 4.00, 4.00, 4.00, 4.00, 4.00, 3.97, 3.85, 3.58, 3.05, 2.37, 1.60, 1.00],

                // Row 17
                [0.98, 1.57, 2.32, 2.98, 3.50, 3.78, 3.90, 3.93, 3.93, 3.93, 3.93, 3.93, 3.93, 3.90, 3.78, 3.50, 2.98, 2.32, 1.57, 0.98],

                // Row 18
                [0.92, 1.47, 2.18, 2.80, 3.28, 3.55, 3.65, 3.68, 3.68, 3.68, 3.68, 3.68, 3.68, 3.65, 3.55, 3.28, 2.80, 2.18, 1.47, 0.92],

                // Row 19
                [0.82, 1.31, 1.94, 2.49, 2.90, 3.10, 3.18, 3.20, 3.20, 3.20, 3.20, 3.20, 3.20, 3.18, 3.10, 2.90, 2.49, 1.94, 1.31, 0.82],

                // Row 20
                [0.70, 1.12, 1.65, 2.12, 2.45, 2.62, 2.68, 2.70, 2.70, 2.70, 2.70, 2.70, 2.70, 2.68, 2.62, 2.45, 2.12, 1.65, 1.12, 0.70]

            ];









            globalThis.train_use_bogies = true;
            globalThis.train_use_body = true;


            globalThis.trainWidth = 2.8;
            globalThis.bogie_proportions = 1.9;  // How many times longer is the bogie in z direction compared to track gauge
            globalThis.bogie_height = 1;



            globalThis.EYE_HEIGHT = 2;  // the view eye height
            globalThis.cameraXOffset = -0.5;  // camera offset for train cab

        }
    }
},


































    {
        name: "Bombardier low floor tram",
        description: "A classic tram that runds in Cologne and Croydon known for its Kiepe VF drive",
        preferedVF: ["Kiepe Croydon tram (50 mph)","kiepe express tram (60 mph)"],
        preferedLivery: ["Green"],
        preferedNumberOfCoaches: 2,
        scripts: {
            train_config() {

                globalThis.traindoors = [[0.284, true, true, true ,true, 1.5, 0, 2],[0.716, true, true, true ,true, 1.5, 0, 2]];  // [[door-z, front_coach, middle_coach, rear_coach, railbus, door-width, door_type, door_direction]]
                //   Door-z is the position in the coach the door is to be added.  Position is based on the coach position before overhangs are added.  Between 0 and 1 as percentage of train length.
                //   front_coach is boolean of if the door will be placed on the first coach
                //   middle_coach is boolean of if the door will be placed on any non front and non rear coaches
                //   rear_coach is boolean of if the door will be placed on the last coach
                //   railbus is boolean of if the door will be placed on a single coach train
                //   door-width is width of doors (total width of door section, so if double doors then the doors are half this)
                //   door-type is as follows.   door-type is as follows.   0 is plug doors which sit flush to the train and pop out slightly and slide.  1 is outside sliding doors, which sit on outside of train and slide.  2 is inset sliding doors.   3 is bus style swing doors that open inwards.   4 is slam doors which fold outwards
                //   door_direction is which way the doors open.  0 is door that opens in forwads direction, 1 is door that opens in rear directing, and 2 is 2 doors, one opening forwards and one opening backwards

                globalThis.train_floor_height = 0.6;
                globalThis.train_roof_height = 3.5;
                globalThis.train_doortop_percentage = 0.8;
                globalThis.train_body_dimentions = [[1,0],[1,0.8],[0.8,0.98],[0,1]];  //  List of x y co-ords of the train body running lengthwise down the train.
                globalThis.door_speed = 3;  // Time it trakes to open and close doors
                globalThis.door_alarm = 3;  // Time to sound alarm before doors shut
                globalThis.Jacobs_bogies = true; // true means its like a tram where coaches sit between bogies.  False means regukar train bogies.
                globalThis.trains_bogies_percentage = 50;  //  For non Jacobs bogies only. Value of how far the trains bogies are down the coach.  100 means they are at the very ends and overlapping next coach, and 0 means they are in the very middle.  So 50 is a normal value.
                globalThis.coachlength = 10.5;
                globalThis.cab_overhang = 2;  // On the very front and rear how much longer should the coach be.  This is important for Jacobs_bogies.
                globalThis.non_cab_overhang = -1.4;  // how huch should the non cab end of coaches overhang.  set to -0.5 for normal trains.
                globalThis.gangways = true;
                globalThis.livery_includes_cab = true;    //  Does the livery affect the cab.  If true it needs textures for it.


                globalThis.cab3d = [

                    // Row 1 — upper LED display section
                    [0.07, 0.09, 0.11, 0.12, 0.13, 0.14, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.14, 0.13, 0.12, 0.11, 0.09, 0.07],

                    // Row 2
                    [0.08, 0.10, 0.12, 0.13, 0.14, 0.15, 0.16, 0.16, 0.16, 0.16, 0.16, 0.16, 0.16, 0.16, 0.15, 0.14, 0.13, 0.12, 0.10, 0.08],

                    // Row 3
                    [0.09, 0.11, 0.13, 0.14, 0.15, 0.16, 0.17, 0.17, 0.17, 0.17, 0.17, 0.17, 0.17, 0.17, 0.16, 0.15, 0.14, 0.13, 0.11, 0.09],

                    // Row 4
                    [0.10, 0.12, 0.14, 0.15, 0.16, 0.17, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.17, 0.16, 0.15, 0.14, 0.12, 0.10],

                    // Row 5
                    [0.12, 0.14, 0.16, 0.18, 0.19, 0.20, 0.21, 0.21, 0.21, 0.21, 0.21, 0.21, 0.21, 0.21, 0.20, 0.19, 0.18, 0.16, 0.14, 0.12],

                    // Row 6
                    [0.15, 0.17, 0.19, 0.21, 0.23, 0.24, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.24, 0.23, 0.21, 0.19, 0.17, 0.15],

                    // Row 7
                    [0.18, 0.20, 0.22, 0.25, 0.27, 0.28, 0.29, 0.29, 0.29, 0.29, 0.29, 0.29, 0.29, 0.29, 0.28, 0.27, 0.25, 0.22, 0.20, 0.18],

                    // Row 8
                    [0.21, 0.23, 0.26, 0.29, 0.31, 0.32, 0.33, 0.33, 0.33, 0.33, 0.33, 0.33, 0.33, 0.33, 0.32, 0.31, 0.29, 0.26, 0.23, 0.21],

                    // Row 9
                    [0.24, 0.27, 0.30, 0.33, 0.35, 0.36, 0.37, 0.37, 0.37, 0.37, 0.37, 0.37, 0.37, 0.37, 0.36, 0.35, 0.33, 0.30, 0.27, 0.24],

                    // Row 10
                    [0.28, 0.31, 0.34, 0.37, 0.39, 0.40, 0.41, 0.41, 0.41, 0.41, 0.41, 0.41, 0.41, 0.41, 0.40, 0.39, 0.37, 0.34, 0.31, 0.28],

                    // Row 11
                    [0.32, 0.35, 0.38, 0.41, 0.43, 0.44, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.44, 0.43, 0.41, 0.38, 0.35, 0.32],

                    // Row 12
                    [0.36, 0.39, 0.42, 0.45, 0.47, 0.48, 0.49, 0.49, 0.49, 0.49, 0.49, 0.49, 0.49, 0.49, 0.48, 0.47, 0.45, 0.42, 0.39, 0.36],

                    // Row 13
                    [0.40, 0.43, 0.46, 0.49, 0.51, 0.52, 0.53, 0.53, 0.53, 0.53, 0.53, 0.53, 0.53, 0.53, 0.52, 0.51, 0.49, 0.46, 0.43, 0.40],

                    // Row 14
                    [0.44, 0.47, 0.50, 0.53, 0.55, 0.56, 0.57, 0.57, 0.57, 0.57, 0.57, 0.57, 0.57, 0.57, 0.56, 0.55, 0.53, 0.50, 0.47, 0.44],

                    // Row 15
                    [0.48, 0.51, 0.54, 0.57, 0.59, 0.60, 0.61, 0.61, 0.61, 0.61, 0.61, 0.61, 0.61, 0.61, 0.60, 0.59, 0.57, 0.54, 0.51, 0.48],

                    // Row 16
                    [0.52, 0.55, 0.58, 0.61, 0.63, 0.64, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.64, 0.63, 0.61, 0.58, 0.55, 0.52],

                    // Row 17
                    [0.56, 0.59, 0.62, 0.65, 0.67, 0.68, 0.69, 0.69, 0.69, 0.69, 0.69, 0.69, 0.69, 0.69, 0.68, 0.67, 0.65, 0.62, 0.59, 0.56],

                    // Row 18 — bumper begins
                    [0.61, 0.64, 0.67, 0.70, 0.73, 0.75, 0.77, 0.78, 0.78, 0.78, 0.78, 0.78, 0.78, 0.77, 0.75, 0.73, 0.70, 0.67, 0.64, 0.61],

                    // Row 19 — bumper projects slightly further forwards
                    [0.65, 0.68, 0.72, 0.76, 0.80, 0.84, 0.87, 0.89, 0.90, 0.90, 0.90, 0.90, 0.89, 0.87, 0.84, 0.80, 0.76, 0.72, 0.68, 0.65],

                    // Row 20 — rounded lower bumper edge
                    [0.68, 0.71, 0.75, 0.80, 0.85, 0.89, 0.93, 0.96, 0.98, 1.00, 1.00, 0.98, 0.96, 0.93, 0.89, 0.85, 0.80, 0.75, 0.71, 0.68]

                ];



                globalThis.train_use_bogies = true;
                globalThis.train_use_body = true;


                globalThis.trainWidth = 2.6;
                globalThis.bogie_proportions = 1.3;  // How many times longer is the bogie in z direction compared to track gauge
                globalThis.bogie_height = 0.6;




                globalThis.EYE_HEIGHT = 2;  // the view eye height
                globalThis.cameraXOffset = 0;  // camera offset for train cab

            }
        }
    },




];


